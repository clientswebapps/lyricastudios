import { auth, db } from './firebase.js';
import { 
  signInWithEmailAndPassword, 
  onAuthStateChanged, 
  signOut,
  createUserWithEmailAndPassword,
  getAuth
} from 'firebase/auth';
import { initializeApp } from 'firebase/app';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc,
  serverTimestamp 
} from 'firebase/firestore';

// --- State ---
let currentUser = null;
let userData = null;
let unsubscribePool = null;
let unsubscribeTasks = null;
let unsubscribeQA = null;
let unsubscribeUsers = null;

// DOM Elements
const authView = document.getElementById('auth-view');
const dashboardView = document.getElementById('dashboard-view');
const loginForm = document.getElementById('login-form');
const authError = document.getElementById('auth-error');
const logoutBtn = document.getElementById('logout-btn');

// Navigation
const navBtns = document.querySelectorAll('.nav-btn');
const viewSections = document.querySelectorAll('.view-section');

// User Stats
const elUserName = document.getElementById('user-name');
const elUserRole = document.getElementById('user-role');
const elUserIncentives = document.getElementById('user-incentives');
const elUserPenalties = document.getElementById('user-penalties');
const elUserActiveTasks = document.getElementById('user-active-tasks');

// Lists
const poolList = document.getElementById('pool-list');
const tasksList = document.getElementById('tasks-list');
const qaList = document.getElementById('qa-list');
const usersList = document.getElementById('users-list');

// Modal
const orderModal = document.getElementById('order-modal');
const closeOrderModalBtn = document.getElementById('close-order-modal');
let currentModalOrderId = null;
let currentModalOrderData = null;

// --- Authentication & Initialization ---
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    await loadUserData(user.uid);
    showDashboard();
    setupListeners();
  } else {
    currentUser = null;
    userData = null;
    showAuth();
    clearListeners();
  }
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('admin-email').value;
  const password = document.getElementById('admin-password').value;
  
  try {
    authError.style.display = 'none';
    const btn = loginForm.querySelector('button');
    btn.disabled = true;
    btn.innerText = 'Logging in...';
    
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    authError.innerText = error.message;
    authError.style.display = 'block';
  } finally {
    const btn = loginForm.querySelector('button');
    btn.disabled = false;
    btn.innerText = 'Login';
  }
});

logoutBtn.addEventListener('click', () => {
  signOut(auth);
});

async function loadUserData(uid) {
  const userRef = doc(db, 'users', uid);
  const userSnap = await getDoc(userRef);
  if (userSnap.exists()) {
    userData = userSnap.data();
    updateUserUI();
    
    // Show admin-only menus
    if (userData.role === 'admin') {
      document.getElementById('nav-qa').style.display = 'block';
      document.getElementById('nav-users').style.display = 'block';
    }
  } else {
    // If not exists, might be a first-time login for an artist or we seed it
    console.error("User data not found in Firestore!");
    authError.innerText = "Account not found in database.";
    authError.style.display = 'block';
    signOut(auth);
  }
}

function updateUserUI() {
  if (!userData) return;
  elUserName.innerText = userData.name || 'Unknown';
  elUserRole.innerText = userData.role || 'Artist';
  elUserIncentives.innerText = (userData.incentives || 0).toFixed(2);
  elUserPenalties.innerText = (userData.penalties || 0).toFixed(2);
  elUserActiveTasks.innerText = userData.activeTasks || 0;
}

function showAuth() {
  authView.style.display = 'flex';
  dashboardView.style.display = 'none';
}

function showDashboard() {
  authView.style.display = 'none';
  dashboardView.style.display = 'flex';
}

// --- Navigation ---
navBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    navBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    viewSections.forEach(sec => sec.style.display = 'none');
    document.getElementById(btn.dataset.view).style.display = 'block';
  });
});

// --- Listeners ---
function setupListeners() {
  // Order Pool (Pending)
  const poolQ = query(collection(db, 'orders'), where('status', '==', 'Pending Assignment'));
  unsubscribePool = onSnapshot(poolQ, (snapshot) => {
    poolList.innerHTML = '';
    if (snapshot.empty) {
      poolList.innerHTML = '<p class="text-muted">No pending orders.</p>';
      return;
    }
    snapshot.forEach(doc => {
      poolList.appendChild(createOrderCard(doc.id, doc.data()));
    });
  });

  // My Tasks
  const tasksQ = query(collection(db, 'orders'), where('assignedArtistId', '==', currentUser.uid));
  unsubscribeTasks = onSnapshot(tasksQ, (snapshot) => {
    tasksList.innerHTML = '';
    // Let's recalculate active tasks for the user dynamically
    let activeCount = 0;
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.status !== 'Completed' && data.status !== 'Delivered') {
        activeCount++;
      }
      tasksList.appendChild(createOrderCard(doc.id, data));
    });
    
    if (userData && userData.activeTasks !== activeCount) {
      updateDoc(doc(db, 'users', currentUser.uid), { activeTasks: activeCount });
      userData.activeTasks = activeCount;
      updateUserUI();
    }
  });

  // Admin Only Listeners
  if (userData && userData.role === 'admin') {
    const qaQ = query(collection(db, 'orders'), where('status', '==', 'Awaiting QA'));
    unsubscribeQA = onSnapshot(qaQ, (snapshot) => {
      qaList.innerHTML = '';
      snapshot.forEach(doc => {
        qaList.appendChild(createOrderCard(doc.id, doc.data()));
      });
    });

    const usersQ = query(collection(db, 'users'));
    unsubscribeUsers = onSnapshot(usersQ, (snapshot) => {
      usersList.innerHTML = '';
      snapshot.forEach(doc => {
        usersList.appendChild(createUserCard(doc.id, doc.data()));
      });
    });
  }
}

function clearListeners() {
  if (unsubscribePool) unsubscribePool();
  if (unsubscribeTasks) unsubscribeTasks();
  if (unsubscribeQA) unsubscribeQA();
  if (unsubscribeUsers) unsubscribeUsers();
}

// --- UI Components ---
function createOrderCard(id, data) {
  const card = document.createElement('div');
  card.className = 'order-card';
  card.onclick = () => openOrderModal(id, data);
  card.style.cursor = 'pointer';

  // Status mapping
  const statusClasses = {
    'Pending Assignment': 'status-pending',
    'Lyrics In Progress': 'status-lyrics',
    'Song In Production': 'status-production',
    'Awaiting QA': 'status-qa',
    'Completed': 'status-completed'
  };
  const statusClass = statusClasses[data.status] || 'status-pending';

  card.innerHTML = `
    <div class="order-card-header">
      <span class="order-id">#${id.slice(0, 8).toUpperCase()}</span>
      <span class="status-badge ${statusClass}">${data.status}</span>
    </div>
    <div class="order-details">
      <p><strong>Genre:</strong> ${data.customerData?.genre || 'N/A'}</p>
      <p><strong>Mood:</strong> ${data.customerData?.mood || 'N/A'}</p>
    </div>
    <div class="order-timer">
      <span>Timer:</span>
      <span class="timer-text">${calculateTimer(data)}</span>
    </div>
  `;
  return card;
}

function createUserCard(id, data) {
  const card = document.createElement('div');
  card.className = 'user-card';
  card.innerHTML = `
    <h4>${data.name} <small>(${data.role})</small></h4>
    <p>Email: ${data.email}</p>
    <p>Active Tasks: ${data.activeTasks || 0}</p>
    <p class="text-success">Incentives: $${(data.incentives||0).toFixed(2)}</p>
    <p class="text-danger">Penalties: $${(data.penalties||0).toFixed(2)}</p>
  `;
  return card;
}

function calculateTimer(data) {
  if (data.status === 'Pending Assignment') return '--:--';
  
  // Logic for countdowns (simplified for UI)
  const now = new Date();
  let deadline = null;
  
  if (data.status === 'Lyrics In Progress' && data.timestamps?.lyricsDeadline) {
    deadline = data.timestamps.lyricsDeadline.toDate();
  } else if (data.status === 'Song In Production' && data.timestamps?.productionDeadline) {
    deadline = data.timestamps.productionDeadline.toDate();
  }

  if (!deadline) return '--:--';

  const diff = deadline - now;
  if (diff < 0) return '<span class="timer-danger">OVERDUE</span>';

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m left`;
}

// --- Modal Logic ---
function openOrderModal(id, data) {
  currentModalOrderId = id;
  currentModalOrderData = data;
  
  document.getElementById('modal-order-id').innerText = `Order #${id}`;
  document.getElementById('modal-order-status').innerText = data.status;
  document.getElementById('modal-order-recipient').innerText = data.customerData?.recipient || 'N/A';
  document.getElementById('modal-order-name').innerText = data.customerData?.name || 'N/A';
  document.getElementById('modal-order-pronouns').innerText = data.customerData?.pronouns || 'N/A';
  document.getElementById('modal-order-occasion').innerText = data.customerData?.occasion || 'N/A';
  document.getElementById('modal-order-genre').innerText = data.customerData?.genre || 'N/A';
  document.getElementById('modal-order-mood').innerText = data.customerData?.mood || 'N/A';
  document.getElementById('modal-order-plan').innerText = (data.customerData?.plan || 'standard').charAt(0).toUpperCase() + (data.customerData?.plan || 'standard').slice(1);
  document.getElementById('modal-order-price').innerText = data.customerData?.price || '$79';
  document.getElementById('modal-order-words').innerText = (data.customerData?.words && data.customerData.words.length > 0) ? data.customerData.words.join(', ') : 'None';
  document.getElementById('modal-order-story').innerText = data.customerData?.occasionStory || 'No story provided.';
  document.getElementById('modal-order-memories').innerText = data.customerData?.memories || 'None provided.';

  // Build action area
  const actionArea = document.getElementById('modal-action-area');
  actionArea.innerHTML = ''; // clear

  if (data.status === 'Pending Assignment') {
    const btn = document.createElement('button');
    btn.className = 'btn btn--accent';
    btn.innerText = 'Accept Order';
    btn.onclick = acceptOrder;
    actionArea.appendChild(btn);
  } else if (data.status === 'Lyrics In Progress' && data.assignedArtistId === currentUser.uid) {
    actionArea.innerHTML = `
      <textarea id="submit-lyrics-text" class="form-group" rows="4" placeholder="Paste lyrics here..." style="width:100%; padding: 1rem; border-radius: 8px; border: 1px solid var(--border); background: rgba(0,0,0,0.2); color: #fff;"></textarea>
      <button class="btn btn--accent" id="btn-submit-lyrics">Submit Lyrics</button>
    `;
    document.getElementById('btn-submit-lyrics').onclick = submitLyrics;
  } else if (data.status === 'Song In Production' && data.assignedArtistId === currentUser.uid) {
    actionArea.innerHTML = `
      <input type="text" id="submit-audio-url" class="form-group" placeholder="Audio URL (Soundcloud/Drive link)" style="width:100%; padding: 1rem; border-radius: 8px; border: 1px solid var(--border); background: rgba(0,0,0,0.2); color: #fff;">
      <button class="btn btn--accent" id="btn-submit-song">Submit Song</button>
    `;
    document.getElementById('btn-submit-song').onclick = submitSong;
  } else if (data.status === 'Awaiting QA' && userData.role === 'admin') {
    actionArea.innerHTML = `
      <div style="display:flex; gap:1rem;">
        <button class="btn btn--accent" id="btn-approve">Approve</button>
        <button class="btn btn--outline" id="btn-reject" style="color:var(--danger); border-color:var(--danger)">Reject (Needs Revision)</button>
      </div>
    `;
    document.getElementById('btn-approve').onclick = () => qaDecision('approved');
    document.getElementById('btn-reject').onclick = () => qaDecision('rejected');
  }

  // Display Assets if any
  const assetsDiv = document.getElementById('modal-order-assets');
  assetsDiv.innerHTML = '';
  if (data.assets?.lyricsText) {
    assetsDiv.innerHTML += `<h4>Lyrics</h4><blockquote style="white-space: pre-wrap; font-size:0.9rem;">${data.assets.lyricsText}</blockquote>`;
  }
  if (data.assets?.audioFileUrl) {
    assetsDiv.innerHTML += `<h4 style="margin-top:1rem;">Audio File</h4><a href="${data.assets.audioFileUrl}" target="_blank" style="color:var(--accent);">Listen to Song</a>`;
  }

  orderModal.style.display = 'flex';
}

closeOrderModalBtn.onclick = () => {
  orderModal.style.display = 'none';
  currentModalOrderId = null;
  currentModalOrderData = null;
};

window.onclick = (e) => {
  if (e.target === orderModal) {
    orderModal.style.display = 'none';
  }
};

// --- Workflow Actions ---
async function acceptOrder() {
  if (userData.activeTasks >= 5) {
    alert("You have reached the maximum capacity of 5 tasks.");
    return;
  }
  if (userData.penaltyStatus) {
    alert("You are currently on a penalty and have reduced capacity.");
    // Implement stricter check if needed
  }

  const orderRef = doc(db, 'orders', currentModalOrderId);
  
  // Set 4 hour deadline
  const now = new Date();
  const deadline = new Date(now.getTime() + 4 * 60 * 60 * 1000);

  try {
    await updateDoc(orderRef, {
      status: 'Lyrics In Progress',
      assignedArtistId: currentUser.uid,
      'timestamps.lyricsDeadline': deadline
    });
    alert("Order accepted! You have 4 hours to submit lyrics.");
    orderModal.style.display = 'none';
  } catch(e) {
    console.error(e);
    alert("Error accepting order.");
  }
}

async function submitLyrics() {
  const lyrics = document.getElementById('submit-lyrics-text').value;
  if (!lyrics) return alert("Please enter lyrics.");

  const orderRef = doc(db, 'orders', currentModalOrderId);
  
  // Set 8 hour deadline for production
  const now = new Date();
  const deadline = new Date(now.getTime() + 8 * 60 * 60 * 1000);

  try {
    await updateDoc(orderRef, {
      status: 'Song In Production',
      'assets.lyricsText': lyrics,
      'timestamps.productionDeadline': deadline
    });
    alert("Lyrics submitted! You have 8 hours to produce the song.");
    orderModal.style.display = 'none';
  } catch(e) {
    console.error(e);
    alert("Error submitting lyrics.");
  }
}

async function submitSong() {
  const url = document.getElementById('submit-audio-url').value;
  if (!url) return alert("Please provide the audio URL.");

  const orderRef = doc(db, 'orders', currentModalOrderId);
  
  try {
    await updateDoc(orderRef, {
      status: 'Awaiting QA',
      'assets.audioFileUrl': url
    });
    alert("Song submitted for QA!");
    orderModal.style.display = 'none';
  } catch(e) {
    console.error(e);
    alert("Error submitting song.");
  }
}

async function qaDecision(decision) {
  const orderRef = doc(db, 'orders', currentModalOrderId);
  
  try {
    if (decision === 'approved') {
      await updateDoc(orderRef, { status: 'Ready for Delivery' });
      // Here we could also distribute the incentive to the artist
      const artistRef = doc(db, 'users', currentModalOrderData.assignedArtistId);
      const artistSnap = await getDoc(artistRef);
      if(artistSnap.exists()){
         const currentInc = artistSnap.data().incentives || 0;
         await updateDoc(artistRef, { incentives: currentInc + 20 }); // arbitrary $20 incentive
      }
      alert("Order approved and ready for delivery.");
    } else {
      await updateDoc(orderRef, { status: 'Song In Production' }); // Send back to production
      alert("Order rejected and sent back to artist.");
    }
    orderModal.style.display = 'none';
  } catch(e) {
    console.error(e);
    alert("Error updating order.");
  }
}

// --- Create User (Admin Only) ---
// Using a secondary Firebase app to prevent logging out the admin
const createArtistForm = document.getElementById('create-artist-form');
createArtistForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('new-artist-name').value;
  const email = document.getElementById('new-artist-email').value;
  const pass = document.getElementById('new-artist-password').value;
  const msgDiv = document.getElementById('create-user-msg');
  
  msgDiv.className = 'mt-4';
  msgDiv.innerText = 'Creating user...';
  
  try {
    // 1. Fetch config from the main app so we can init secondary
    const firebaseConfig = {
      apiKey: "AIzaSyDGalWLupQvsDa2kvR0GTncPAmwU7s5zlg",
      authDomain: "lyricastudios-2026.firebaseapp.com",
      projectId: "lyricastudios-2026",
      storageBucket: "lyricastudios-2026.firebasestorage.app",
      messagingSenderId: "400849594802",
      appId: "1:400849594802:web:89bad36c93838bd9fe9cab"
    };
    
    // Check if secondary app exists, otherwise initialize it
    const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
    const secondaryAuth = getAuth(secondaryApp);
    
    const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, pass);
    const newUid = userCredential.user.uid;
    
    // 2. Add to Firestore users collection using the main app's db
    await setDoc(doc(db, 'users', newUid), {
      uid: newUid,
      email: email,
      name: name,
      role: 'artist',
      activeTasks: 0,
      incentives: 0,
      penalties: 0,
      penaltyStatus: false,
      createdAt: serverTimestamp()
    });
    
    // 3. Sign out the secondary app immediately so it doesn't linger
    await signOut(secondaryAuth);
    
    msgDiv.classList.add('success-msg');
    msgDiv.innerText = 'Artist account created successfully!';
    createArtistForm.reset();
  } catch (error) {
    console.error(error);
    msgDiv.classList.add('error-msg');
    msgDiv.innerText = 'Error: ' + error.message;
  }
});

// --- Temporary Bootstrap (Development Only) ---
const bootstrapBtn = document.getElementById('bootstrap-admin-btn');
if (bootstrapBtn) {
  bootstrapBtn.addEventListener('click', async () => {
    const email = 'admin@lyricastudios.com';
    const pass = 'admin123';
    
    try {
      bootstrapBtn.disabled = true;
      bootstrapBtn.innerText = 'Creating...';
      
      let newUid = null;
      try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
        newUid = userCredential.user.uid;
      } catch (err) {
        if (err.code === 'auth/email-already-in-use') {
          // Auth user exists, let's log in to get the UID
          const cred = await signInWithEmailAndPassword(auth, email, pass);
          newUid = cred.user.uid;
        } else {
          throw err;
        }
      }
      
      // Ensure the Firestore document exists
      await setDoc(doc(db, 'users', newUid), {
        uid: newUid,
        email: email,
        name: 'Head Admin',
        role: 'admin',
        activeTasks: 0,
        incentives: 0,
        penalties: 0,
        penaltyStatus: false,
        createdAt: serverTimestamp()
      }, { merge: true });
      
      alert(`Success! Head Admin account is ready:\nEmail: ${email}\nPassword: ${pass}\n\nYou can now log in.`);
      
      // auth state listener will handle the auto-login
      bootstrapBtn.style.display = 'none';
      
    } catch (error) {
      alert('Error creating admin: ' + error.message);
      bootstrapBtn.disabled = false;
      bootstrapBtn.innerText = 'Create Initial Head Admin';
    }
  });
}

