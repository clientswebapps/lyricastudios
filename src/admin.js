import { auth, db } from './firebase.js';
import { 
  signInWithEmailAndPassword, 
  onAuthStateChanged, 
  signOut,
  createUserWithEmailAndPassword,
  updatePassword,
  sendPasswordResetEmail,
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
  deleteDoc,
  getDocs,
  addDoc,
  orderBy,
  serverTimestamp 
} from 'firebase/firestore';

// --- State ---
let currentUser = null;
let userData = null;
let unsubscribePool = null;
let unsubscribeTasks = null;
let unsubscribeQA = null;
let unsubscribeUsers = null;
let unsubscribeHistory = null;
let unsubscribeUserDoc = null;
let unsubscribeNotifications = null;
let unsubscribeChatMessages = null;
let unsubscribeUnreadCount = null;
let currentChatArtistId = null;
const alertedMessageIds = new Set(); // track which background alerts were displayed locally
let unreadMessagesCount = {}; // map of artistId -> unread count for admin
let localArtists = []; // local cache for admin artist list
let allActivities = []; // local cache for activity logs

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

// Order Modal
const orderModal = document.getElementById('order-modal');
const closeOrderModalBtn = document.getElementById('close-order-modal');
const copyDetailsBtn = document.getElementById('copy-details-btn');
let currentModalOrderId = null;
let currentModalOrderData = null;

// History View DOM Elements
const historyList = document.getElementById('history-list');
const historyFilterArtist = document.getElementById('history-filter-artist');
const historyFilterAction = document.getElementById('history-filter-action');
const filterArtistContainer = document.getElementById('filter-artist-container');

// Artist Modal DOM Elements
const artistModal = document.getElementById('artist-modal');
const closeArtistModalBtn = document.getElementById('close-artist-modal');
const modalArtistName = document.getElementById('modal-artist-name');
const modalArtistEmail = document.getElementById('modal-artist-email');
const modalArtistRole = document.getElementById('modal-artist-role');
const modalArtistIncentives = document.getElementById('modal-artist-incentives');
const modalArtistPenalties = document.getElementById('modal-artist-penalties');
const modalArtistActive = document.getElementById('modal-artist-active');
const modalArtistTotalAssigned = document.getElementById('modal-artist-total-assigned');
const modalArtistCompleted = document.getElementById('modal-artist-completed');
const modalArtistPending = document.getElementById('modal-artist-pending');
const modalArtistOrdersList = document.getElementById('modal-artist-orders-list');

// Mobile Navigation Drawer elements
const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const sidebar = document.getElementById('sidebar');

// Change Password DOM Elements
const changePasswordModal = document.getElementById('change-password-modal');
const closeChangePassModalBtn = document.getElementById('close-change-pass-modal');
const changePassForm = document.getElementById('change-pass-form');
const changePassMsg = document.getElementById('change-pass-msg');
const sidebarChangePassBtn = document.getElementById('change-pass-btn');

// Logout Confirm DOM Elements
const logoutConfirmModal = document.getElementById('logout-confirm-modal');
const logoutCancelBtn = document.getElementById('logout-cancel-btn');
const logoutConfirmBtn = document.getElementById('logout-confirm-btn');

// Alert Modal DOM Elements
const alertModal = document.getElementById('alert-modal');
const alertModalIcon = document.getElementById('alert-modal-icon');
const alertModalTitle = document.getElementById('alert-modal-title');
const alertModalMessage = document.getElementById('alert-modal-message');
const closeAlertModalBtn = document.getElementById('close-alert-modal-btn');

// Admin Modal Reset Pass Element
const modalArtistResetPass = document.getElementById('modal-artist-reset-pass');
const modalArtistNotify = document.getElementById('modal-artist-notify');
const modalArtistSuspend = document.getElementById('modal-artist-suspend');
const modalArtistDelete = document.getElementById('modal-artist-delete');

// Delete Artist Confirm DOM Elements
const deleteArtistConfirmModal = document.getElementById('delete-artist-confirm-modal');
const deleteArtistCancelBtn = document.getElementById('delete-artist-cancel-btn');
const deleteArtistConfirmBtn = document.getElementById('delete-artist-confirm-btn');
const deleteArtistNamePlaceholder = document.getElementById('delete-artist-name-placeholder');

// Chat DOM Elements
const adminMessagesLayout = document.getElementById('admin-messages-layout');
const artistMessagesLayout = document.getElementById('artist-messages-layout');
const chatArtistList = document.getElementById('chat-artist-list');
const chatActiveTitle = document.getElementById('chat-active-title');
const adminChatMessages = document.getElementById('admin-chat-messages');
const adminChatForm = document.getElementById('admin-chat-form');
const adminChatInput = document.getElementById('admin-chat-input');
const adminChatDeleteAllBtn = document.getElementById('admin-chat-delete-all-btn');
const artistChatMessages = document.getElementById('artist-chat-messages');
const artistChatForm = document.getElementById('artist-chat-form');
const artistChatInput = document.getElementById('artist-chat-input');
const messagesNavBadge = document.getElementById('messages-nav-badge');

// --- Authentication & Initialization ---
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    listenToUserDoc(user.uid);
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
    authError.innerText = getFriendlyFirebaseErrorMessage(error, 'An error occurred during login. Please try again.');
    authError.style.display = 'block';
  } finally {
    const btn = loginForm.querySelector('button');
    btn.disabled = false;
    btn.innerText = 'Login';
  }
});

logoutBtn.addEventListener('click', () => {
  if (logoutConfirmModal) logoutConfirmModal.style.display = 'flex';
});

function listenToUserDoc(uid) {
  if (unsubscribeUserDoc) unsubscribeUserDoc();
  
  const userRef = doc(db, 'users', uid);
  unsubscribeUserDoc = onSnapshot(userRef, (userSnap) => {
    if (userSnap.exists()) {
      userData = userSnap.data();
      
      // If suspended, notify user and log out
      if (userData.suspended) {
        signOut(auth);
        showAlertModal("Your account has been suspended by the administrator.", "Account Suspended", "error");
        return;
      }
      
      updateUserUI();
      
      // Show admin-only menus
      if (userData.role === 'admin') {
        document.getElementById('nav-qa').style.display = 'block';
        document.getElementById('nav-users').style.display = 'block';
        if (adminMessagesLayout) adminMessagesLayout.style.display = 'flex';
        if (artistMessagesLayout) artistMessagesLayout.style.display = 'none';
      } else {
        document.getElementById('nav-qa').style.display = 'none';
        document.getElementById('nav-users').style.display = 'none';
        if (adminMessagesLayout) adminMessagesLayout.style.display = 'none';
        if (artistMessagesLayout) artistMessagesLayout.style.display = 'flex';
        // For artist, load chat with Admin
        listenToChat(currentUser.uid, artistChatMessages);
      }
      if (filterArtistContainer) filterArtistContainer.style.display = 'block';
      
      // Show History tab for everyone
      const navHistory = document.getElementById('nav-history');
      if (navHistory) navHistory.style.display = 'block';
    } else {
      // User document does not exist (deleted by admin)
      signOut(auth);
      showAlertModal("Your account profile was not found. Please contact the administrator.", "Account Deleted", "error");
    }
  });
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
    const targetSection = document.getElementById(btn.dataset.view);
    if (targetSection) targetSection.style.display = 'block';

    // Close mobile menu if open
    if (sidebar && sidebarOverlay) {
      sidebar.classList.remove('open');
      sidebarOverlay.classList.remove('active');
    }
  });
});

// Mobile Toggles Event Handlers
if (mobileMenuToggle && sidebar && sidebarOverlay) {
  mobileMenuToggle.onclick = (e) => {
    e.stopPropagation();
    sidebar.classList.toggle('open');
    sidebarOverlay.classList.toggle('active');
  };

  sidebarOverlay.onclick = () => {
    sidebar.classList.remove('open');
    sidebarOverlay.classList.remove('active');
  };
}

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
    const orders = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.status !== 'Completed' && data.status !== 'Delivered') {
        activeCount++;
      }
      orders.push({ id: doc.id, ...data });
    });

    // Sort in-memory by priority, with creation timestamp fallback
    orders.sort((a, b) => {
      const pA = a.priority !== undefined ? a.priority : 1000;
      const pB = b.priority !== undefined ? b.priority : 1000;
      if (pA !== pB) return pA - pB;
      
      const timeA = a.timestamps?.createdAt ? a.timestamps.createdAt.toMillis() : 0;
      const timeB = b.timestamps?.createdAt ? b.timestamps.createdAt.toMillis() : 0;
      return timeA - timeB;
    });

    orders.forEach(order => {
      tasksList.appendChild(createOrderCard(order.id, order, true));
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

  }

  // Users list (admin) and artist history dropdown (everyone)
  const usersQ = query(collection(db, 'users'));
  unsubscribeUsers = onSnapshot(usersQ, (snapshot) => {
    if (userData && userData.role === 'admin') {
      usersList.innerHTML = '';
    }
    
    localArtists = [];
    
    const currentSelectedArtist = historyFilterArtist.value;
    historyFilterArtist.innerHTML = '<option value="">All Artists</option>';
    
    snapshot.forEach(doc => {
      const uData = doc.data();
      if (userData && userData.role === 'admin') {
        usersList.appendChild(createUserCard(doc.id, uData));
      }
      
      // Populate historical log artist selector
      if (uData.role !== 'admin') {
        localArtists.push({ id: doc.id, ...uData });
        const opt = document.createElement('option');
        opt.value = doc.id;
        opt.textContent = uData.name || 'Unknown';
        if (doc.id === currentSelectedArtist) {
          opt.selected = true;
        }
        historyFilterArtist.appendChild(opt);
      }
    });
    
    if (userData && userData.role === 'admin') {
      renderChatArtistList();
    }
  });

  // History logs listener (everyone)
  const historyQ = query(collection(db, 'activities'), orderBy('timestamp', 'desc'));
  unsubscribeHistory = onSnapshot(historyQ, (snapshot) => {
    allActivities = [];
    snapshot.forEach(doc => {
      allActivities.push({ id: doc.id, ...doc.data() });
    });
    renderHistory();
  });

  // Real-time notifications listener for messages targeting the current user
  const notifyQ = query(
    collection(db, 'messages'),
    where('read', '==', false)
  );
  unsubscribeNotifications = onSnapshot(notifyQ, (snapshot) => {
    const activeTabBtn = document.querySelector('.nav-btn.active');
    const activeView = activeTabBtn ? activeTabBtn.dataset.view : '';
    
    if (activeView === 'messages-view') return; // Don't interrupt active chat
    
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const docId = docSnap.id;
      
      if (data.senderId !== currentUser.uid) {
        const isTargetUser = (userData && userData.role === 'admin' && data.senderId === data.artistId) || 
                             (userData && userData.role !== 'admin' && data.artistId === currentUser.uid);
                             
        if (isTargetUser && !alertedMessageIds.has(docId)) {
          alertedMessageIds.add(docId);
          showAlertModal(data.message, `New message from ${data.senderName}`, 'info');
        }
      }
    });
  });

  // Unread messages count listener for admin & artist nav badge
  const unreadQ = query(collection(db, 'messages'), where('read', '==', false));
  unsubscribeUnreadCount = onSnapshot(unreadQ, (snapshot) => {
    unreadMessagesCount = {};
    let totalUnread = 0;
    
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (data.senderId !== currentUser.uid) {
        const isIncomingForMe = (userData && userData.role === 'admin') || 
                                (userData && userData.role !== 'admin' && data.artistId === currentUser.uid);
                                
        if (isIncomingForMe) {
          const aId = data.artistId;
          unreadMessagesCount[aId] = (unreadMessagesCount[aId] || 0) + 1;
          totalUnread++;
        }
      }
    });
    
    if (userData && userData.role === 'admin') {
      renderChatArtistList();
    }
    
    updateMessagesNavBadge(totalUnread);
  });

  // Set up drag and drop reordering
  setupDragAndDrop(tasksList, handleTasksReorder);
  setupDragAndDrop(modalArtistOrdersList, () => handleArtistModalReorder(modalArtistOrdersList.dataset.artistId));

  // Initialize support query listeners
  setupSupportListeners();
}

function clearListeners() {
  if (unsubscribePool) unsubscribePool();
  if (unsubscribeTasks) unsubscribeTasks();
  if (unsubscribeQA) unsubscribeQA();
  if (unsubscribeUsers) unsubscribeUsers();
  if (unsubscribeHistory) unsubscribeHistory();
  if (unsubscribeUserDoc) {
    unsubscribeUserDoc();
    unsubscribeUserDoc = null;
  }
  if (unsubscribeNotifications) {
    unsubscribeNotifications();
    unsubscribeNotifications = null;
  }
  if (unsubscribeChatMessages) {
    unsubscribeChatMessages();
    unsubscribeChatMessages = null;
  }
  if (unsubscribeUnreadCount) {
    unsubscribeUnreadCount();
    unsubscribeUnreadCount = null;
  }
  alertedMessageIds.clear();
  
  // Unsubscribe support query listeners
  clearSupportListeners();
}

// --- UI Components ---
function getTimerInfo(data) {
  if (data.status === 'Pending Assignment' || data.status === 'Completed' || data.status === 'Delivered' || data.status === 'Ready for Delivery') {
    return { text: '--:--', className: '' };
  }
  
  const now = new Date();
  let deadline = null;
  
  if (data.status === 'Lyrics In Progress' && data.timestamps?.lyricsDeadline) {
    deadline = data.timestamps.lyricsDeadline.toDate();
  } else if (data.status === 'Song In Production' && data.timestamps?.productionDeadline) {
    deadline = data.timestamps.productionDeadline.toDate();
  }

  if (!deadline) return { text: '--:--', className: '' };

  const diff = deadline - now;
  if (diff < 0) {
    return { text: 'OVERDUE', className: 'card-danger' };
  }

  const oneHour = 60 * 60 * 1000;
  const oneDay = 24 * 60 * 60 * 1000;
  
  const days = Math.floor(diff / oneDay);
  const hours = Math.floor((diff % oneDay) / oneHour);
  const minutes = Math.floor((diff % oneHour) / (1000 * 60));

  let timeText = '';
  if (days > 0) {
    timeText = `${days}d ${hours}h left`;
  } else if (hours > 0) {
    timeText = `${hours}h ${minutes}m left`;
  } else {
    timeText = `${minutes}m left`;
  }

  // If less than 1 hour left
  if (diff < oneHour) {
    return { text: timeText, className: 'card-warning' };
  }

  return { text: timeText, className: '' };
}

function createOrderCard(id, data, draggable = false) {
  const card = document.createElement('div');
  card.className = 'order-card';
  if (draggable) {
    card.setAttribute('draggable', 'true');
    card.dataset.id = id;
  }
  card.onclick = (e) => {
    if (e.target.classList.contains('drag-handle')) {
      e.stopPropagation();
      return;
    }
    openOrderModal(id, data);
  };
  card.style.cursor = 'pointer';

  // Calculate timer and urgency class
  const timerInfo = getTimerInfo(data);
  if (timerInfo.className) {
    card.classList.add(timerInfo.className);
  }

  // Status mapping
  const statusClasses = {
    'Pending Assignment': 'status-pending',
    'Lyrics In Progress': 'status-lyrics',
    'Song In Production': 'status-production',
    'Awaiting QA': 'status-qa',
    'Completed': 'status-completed'
  };
  const statusClass = statusClasses[data.status] || 'status-pending';

  const dragHandleHtml = draggable 
    ? `<span class="drag-handle" title="Drag to reorder">☰</span>` 
    : '';

  const timerTextHtml = timerInfo.className === 'card-danger'
    ? `<span class="timer-text timer-danger">${timerInfo.text}</span>`
    : `<span class="timer-text">${timerInfo.text}</span>`;

  card.innerHTML = `
    <div class="order-card-header">
      <div style="display: flex; align-items: center; gap: 0.5rem;">
        ${dragHandleHtml}
        <span class="order-id">#${id.slice(0, 8).toUpperCase()}</span>
      </div>
      <span class="status-badge ${statusClass}">${data.status}</span>
    </div>
    <div class="order-details">
      <p><strong>Genre:</strong> ${data.customerData?.genre || 'N/A'}</p>
      <p><strong>Mood:</strong> ${data.customerData?.mood || 'N/A'}</p>
    </div>
    <div class="order-timer">
      <span>Time Left:</span>
      ${timerTextHtml}
    </div>
  `;
  return card;
}

function createCompactOrderCard(id, data) {
  const card = document.createElement('div');
  card.className = 'compact-order-card';
  card.setAttribute('draggable', 'true');
  card.dataset.id = id;
  
  card.onclick = (e) => {
    if (e.target.classList.contains('drag-handle')) {
      e.stopPropagation();
      return;
    }
    if (artistModal) artistModal.style.display = 'none';
    openOrderModal(id, data);
  };
  card.style.cursor = 'pointer';

  // Calculate timer and urgency class
  const timerInfo = getTimerInfo(data);
  if (timerInfo.className) {
    card.classList.add(timerInfo.className);
  }

  // Status mapping
  const statusClasses = {
    'Pending Assignment': 'status-pending',
    'Lyrics In Progress': 'status-lyrics',
    'Song In Production': 'status-production',
    'Awaiting QA': 'status-qa',
    'Ready for Delivery': 'status-completed',
    'Completed': 'status-completed',
    'Delivered': 'status-completed'
  };
  const statusClass = statusClasses[data.status] || 'status-pending';

  card.innerHTML = `
    <div class="compact-card-header">
      <div style="display: flex; align-items: center; gap: 0.5rem;">
        <span class="drag-handle" title="Drag to reorder">☰</span>
        <span class="order-id">#${id.slice(0, 8).toUpperCase()}</span>
      </div>
      <span class="status-badge ${statusClass}">${data.status}</span>
    </div>
    <div class="compact-card-body">
      <span class="compact-detail"><strong>Genre:</strong> ${data.customerData?.genre || 'N/A'}</span>
      <span class="compact-detail"><strong>Time Left:</strong> ${timerInfo.text}</span>
    </div>
  `;
  return card;
}

function createUserCard(id, data) {
  const card = document.createElement('div');
  card.className = 'user-card';
  if (data.role !== 'admin') {
    card.onclick = () => openArtistModal(id, data);
    card.style.cursor = 'pointer';
  }
  card.innerHTML = `
    <h4>${data.name} <small>(${data.role})</small></h4>
    <p>Email: ${data.email}</p>
    <p>Active Tasks: ${data.activeTasks || 0}</p>
    <p class="text-success">Incentives: $${(data.incentives||0).toFixed(2)}</p>
    <p class="text-danger">Penalties: $${(data.penalties||0).toFixed(2)}</p>
  `;
  return card;
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

function closeOrderModal() {
  orderModal.style.display = 'none';
  currentModalOrderId = null;
  currentModalOrderData = null;
}

// Global exposure for onClick handlers

// Initialize Live Support Admin logic
let unsubscribeSupportSessions = null;
let unsubscribeSupportChatMessages = null;
let currentSupportSessionId = null;

function selectSupportSession(sId) {
  const supportActiveTitle = document.getElementById('support-active-title');
  const adminSupportForm = document.getElementById('admin-support-form');
  const adminSupportMessages = document.getElementById('admin-support-messages');
  
  if (!adminSupportMessages) return;

  currentSupportSessionId = sId;
  if (supportActiveTitle) supportActiveTitle.innerText = `Chatting with Visitor`;
  if (adminSupportForm) adminSupportForm.style.display = 'flex';
  
  const layout = document.getElementById('support-messages-layout');
  if (layout) layout.classList.add('mobile-chat-active');

  if (unsubscribeSupportChatMessages) {
    unsubscribeSupportChatMessages();
  }

  const messagesRef = collection(db, 'support_messages');
  const q = query(messagesRef, where('sessionId', '==', sId));

  unsubscribeSupportChatMessages = onSnapshot(q, (snapshot) => {
    adminSupportMessages.innerHTML = '';
    const msgs = [];
    snapshot.forEach(docSnap => {
      msgs.push(docSnap.data());
    });
    msgs.sort((a, b) => {
      const tA = a.timestamp && typeof a.timestamp.toMillis === 'function' ? a.timestamp.toMillis() : Date.now();
      const tB = b.timestamp && typeof b.timestamp.toMillis === 'function' ? b.timestamp.toMillis() : Date.now();
      return tA - tB;
    });

    msgs.forEach(msg => {
      const isSent = msg.sender === 'admin';
      
      const bubble = document.createElement('div');
      bubble.className = `chat-bubble ${isSent ? 'sent' : 'received'}`;
      
      const timeStr = (msg.timestamp && typeof msg.timestamp.toDate === 'function') 
        ? msg.timestamp.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) 
        : '...';
      
      bubble.innerHTML = `
        <div class="chat-bubble-content">
          <span class="chat-bubble-text">${msg.text}</span>
          <span class="chat-bubble-time">${timeStr}</span>
        </div>
      `;
      adminSupportMessages.appendChild(bubble);
    });
    adminSupportMessages.scrollTop = adminSupportMessages.scrollHeight;
  }, (error) => {
    console.error("Support messages snapshot error:", error);
  });
}

function setupSupportListeners() {
  console.log('[Support Admin] Setting up support listeners...');
  
  // Prevent duplicate listener setup
  clearSupportListeners();

  const supportSessionList = document.getElementById('support-session-list');
  if (!supportSessionList) {
    console.warn('[Support Admin] support-session-list element not found, aborting.');
    return;
  }

  // Listen to support sessions without orderBy to bypass index errors
  const sessionsQ = query(collection(db, 'support_sessions'));
  
  unsubscribeSupportSessions = onSnapshot(sessionsQ, (snapshot) => {
    console.log('[Support Admin] Snapshot received. Size:', snapshot.size, 'Empty:', snapshot.empty);
    supportSessionList.innerHTML = '';
    
    if (snapshot.empty) {
      supportSessionList.innerHTML = '<p style="padding: 1rem; color: var(--text-muted); text-align: center;">No active sessions.</p>';
      return;
    }
    
    const sessions = [];
    snapshot.forEach(docSnap => {
      sessions.push({ id: docSnap.id, ...docSnap.data() });
    });

    // Sort in memory descending by lastMessageTime
    sessions.sort((a, b) => {
      const tA = a.lastMessageTime && typeof a.lastMessageTime.toMillis === 'function' ? a.lastMessageTime.toMillis() : 0;
      const tB = b.lastMessageTime && typeof b.lastMessageTime.toMillis === 'function' ? b.lastMessageTime.toMillis() : 0;
      return tB - tA;
    });
    
    sessions.forEach(session => {
      const data = session;
      const sId = session.id;
      
      const item = document.createElement('div');
      item.className = `chat-artist-item ${sId === currentSupportSessionId ? 'active' : ''}`;
      
      const timeStr = (data.lastMessageTime && typeof data.lastMessageTime.toDate === 'function') 
        ? data.lastMessageTime.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) 
        : '';
      
      item.innerHTML = `
        <div class="chat-artist-avatar">
          <span>U</span>
        </div>
        <div class="chat-artist-info">
          <div class="chat-artist-name-row">
            <span class="chat-artist-name">Visitor</span>
            <span class="chat-artist-time">${timeStr}</span>
          </div>
          <div class="chat-artist-msg-row">
            <span class="chat-artist-lastmsg">${data.lastMessage || 'New session'}</span>
          </div>
        </div>
      `;
      
      item.onclick = () => {
        selectSupportSession(sId);
        document.querySelectorAll('#support-session-list .chat-artist-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
      };
      
      supportSessionList.appendChild(item);
    });
  }, (error) => {
    console.error("Support sessions snapshot error:", error);
  });
}

function clearSupportListeners() {
  console.log('[Support Admin] Clearing support listeners...');
  if (unsubscribeSupportSessions) {
    unsubscribeSupportSessions();
    unsubscribeSupportSessions = null;
  }
  if (unsubscribeSupportChatMessages) {
    unsubscribeSupportChatMessages();
    unsubscribeSupportChatMessages = null;
  }
}

function initSupportAdmin() {
  console.log('[Support Admin] Initializing static event listeners...');
  const adminSupportForm = document.getElementById('admin-support-form');
  const adminSupportInput = document.getElementById('admin-support-input');
  const mobileSupportBackBtn = document.getElementById('mobile-support-back-btn');

  if (mobileSupportBackBtn) {
    mobileSupportBackBtn.onclick = () => {
      const layout = document.getElementById('support-messages-layout');
      if (layout) layout.classList.remove('mobile-chat-active');
    };
  }

  if (adminSupportForm) {
    adminSupportForm.onsubmit = async (e) => {
      e.preventDefault();
      if (!currentSupportSessionId) return;
      const text = adminSupportInput.value.trim();
      if (!text) return;

      adminSupportInput.value = '';
      try {
        await setDoc(doc(db, 'support_sessions', currentSupportSessionId), {
          lastMessage: text,
          lastMessageTime: serverTimestamp()
        }, { merge: true });

        await addDoc(collection(db, 'support_messages'), {
          sessionId: currentSupportSessionId,
          sender: 'admin',
          text: text,
          timestamp: serverTimestamp()
        });
      } catch (err) {
        console.error(err);
      }
    };
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    try { initSupportAdmin(); } catch (e) { console.error('[Support Admin] Init error:', e); }
  });
} else {
  try { initSupportAdmin(); } catch (e) { console.error('[Support Admin] Init error:', e); }
}

window.onclick = (e) => {
  if (e.target === orderModal) {
    orderModal.style.display = 'none';
  } else if (e.target === artistModal) {
    artistModal.style.display = 'none';
  } else if (e.target === changePasswordModal) {
    changePasswordModal.style.display = 'none';
  } else if (e.target === logoutConfirmModal) {
    logoutConfirmModal.style.display = 'none';
  } else if (e.target === alertModal) {
    alertModal.style.display = 'none';
  } else if (e.target === deleteArtistConfirmModal) {
    deleteArtistConfirmModal.style.display = 'none';
  }
};

// --- Workflow Actions ---
async function acceptOrder() {
  if (userData.activeTasks >= 5) {
    showAlertModal("You have reached the maximum capacity of 5 tasks.", "Capacity Limit", "warning");
    return;
  }
  if (userData.penaltyStatus) {
    showAlertModal("You are currently on a penalty and have reduced capacity.", "Penalty Warning", "warning");
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
    showAlertModal("Order accepted! You have 4 hours to submit lyrics.", "Order Accepted", "success");
    orderModal.style.display = 'none';
    
    // Log Activity
    await logActivity(currentUser.uid, userData.name, currentModalOrderId, 'Accepted Order', `Accepted order #${currentModalOrderId.slice(0, 8).toUpperCase()}`);
  } catch(e) {
    console.error(e);
    showAlertModal("Error accepting order. Please try again.", "Error", "error");
  }
}

async function submitLyrics() {
  const lyrics = document.getElementById('submit-lyrics-text').value;
  if (!lyrics) return showAlertModal("Please enter lyrics.", "Validation Error", "warning");

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
    showAlertModal("Lyrics submitted! You have 8 hours to produce the song.", "Lyrics Submitted", "success");
    orderModal.style.display = 'none';
    
    // Log Activity
    await logActivity(currentUser.uid, userData.name, currentModalOrderId, 'Submitted Lyrics', `Submitted lyrics for order #${currentModalOrderId.slice(0, 8).toUpperCase()}`);
  } catch(e) {
    console.error(e);
    showAlertModal("Error submitting lyrics. Please try again.", "Error", "error");
  }
}

async function submitSong() {
  const url = document.getElementById('submit-audio-url').value;
  if (!url) return showAlertModal("Please provide the audio URL.", "Validation Error", "warning");

  const orderRef = doc(db, 'orders', currentModalOrderId);
  
  try {
    await updateDoc(orderRef, {
      status: 'Awaiting QA',
      'assets.audioFileUrl': url
    });
    showAlertModal("Song submitted for QA!", "Song Submitted", "success");
    orderModal.style.display = 'none';
    
    // Log Activity
    await logActivity(currentUser.uid, userData.name, currentModalOrderId, 'Submitted Song', `Submitted song for order #${currentModalOrderId.slice(0, 8).toUpperCase()}`);
  } catch(e) {
    console.error(e);
    showAlertModal("Error submitting song. Please try again.", "Error", "error");
  }
}

async function qaDecision(decision) {
  const orderRef = doc(db, 'orders', currentModalOrderId);
  
  try {
    const artistRef = doc(db, 'users', currentModalOrderData.assignedArtistId);
    const artistSnap = await getDoc(artistRef);
    const artistName = artistSnap.exists() ? artistSnap.data().name : 'Unknown Artist';

    if (decision === 'approved') {
      await updateDoc(orderRef, { status: 'Ready for Delivery' });
      // Here we could also distribute the incentive to the artist
      if(artistSnap.exists()){
         const currentInc = artistSnap.data().incentives || 0;
         await updateDoc(artistRef, { incentives: currentInc + 20 }); // arbitrary $20 incentive
      }
      showAlertModal("Order approved and ready for delivery.", "QA Approved", "success");
      
      // Log Activity
      await logActivity(currentModalOrderData.assignedArtistId, artistName, currentModalOrderId, 'QA Approved', `Admin approved song for order #${currentModalOrderId.slice(0, 8).toUpperCase()}`);
    } else {
      await updateDoc(orderRef, { status: 'Song In Production' }); // Send back to production
      showAlertModal("Order rejected and sent back to artist.", "QA Rejected", "info");
      
      // Log Activity
      await logActivity(currentModalOrderData.assignedArtistId, artistName, currentModalOrderId, 'QA Rejected', `Admin rejected song for order #${currentModalOrderId.slice(0, 8).toUpperCase()} (needs revision)`);
    }
    orderModal.style.display = 'none';
  } catch(e) {
    console.error(e);
    showAlertModal("Error updating order. Please try again.", "Error", "error");
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
    msgDiv.innerText = getFriendlyFirebaseErrorMessage(error, 'Failed to create artist account.');
  }
});

// --- Temporary Bootstrap (Development Only) ---
const bootstrapBtn = document.getElementById('bootstrap-admin-btn');
if (bootstrapBtn) {
  bootstrapBtn.addEventListener('click', async () => {
    const email = 'admin2@lyricastudios.com';
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
      
      showAlertModal(`Success! Head Admin account is ready:\nEmail: ${email}\nPassword: ${pass}\n\nYou can now log in.`, "Admin Seeding Complete", "success");
      
      // auth state listener will handle the auto-login
      bootstrapBtn.style.display = 'none';
      
    } catch (error) {
      showAlertModal('Error creating admin: ' + error.message, "Error", "error");
      bootstrapBtn.disabled = false;
      bootstrapBtn.innerText = 'Create Initial Head Admin';
    }
  });
}

// --- Activity Logging & History ---
async function logActivity(artistId, artistName, orderId, action, details) {
  try {
    await addDoc(collection(db, 'activities'), {
      artistId: artistId || '',
      artistName: artistName || 'System',
      orderId: orderId || '',
      action: action || '',
      details: details || '',
      timestamp: serverTimestamp()
    });
  } catch (error) {
    console.error("Error logging activity:", error);
  }
}

function renderHistory() {
  if (!historyList) return;
  historyList.innerHTML = '';
  
  const selectedArtist = historyFilterArtist ? historyFilterArtist.value : '';
  const selectedAction = historyFilterAction ? historyFilterAction.value : '';
  
  let filtered = allActivities;
  
  // Artist filter (available to both admins and artists)
  if (selectedArtist) {
    filtered = filtered.filter(act => act.artistId === selectedArtist);
  }
  
  // Action filter
  if (selectedAction) {
    filtered = filtered.filter(act => act.action === selectedAction);
  }
  
  if (filtered.length === 0) {
    historyList.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No activities found.</td></tr>';
    return;
  }
  
  filtered.forEach(act => {
    const tr = document.createElement('tr');
    const timeStr = act.timestamp ? act.timestamp.toDate().toLocaleString() : 'Pending...';
    const shortOrderId = act.orderId ? act.orderId.slice(0, 8).toUpperCase() : 'N/A';
    
    tr.innerHTML = `
      <td>${timeStr}</td>
      <td><strong>${act.artistName || 'Unknown'}</strong></td>
      <td>
        <span class="order-id" style="cursor:pointer; color:var(--accent); font-weight:500;" onclick="viewOrderFromHistory('${act.orderId}')">
          #${shortOrderId}
        </span>
      </td>
      <td><span class="status-badge ${getStatusClassForAction(act.action)}">${act.action}</span></td>
      <td>${act.details}</td>
    `;
    historyList.appendChild(tr);
  });
}

function getStatusClassForAction(action) {
  if (action === 'Accepted Order') return 'status-pending';
  if (action === 'Submitted Lyrics') return 'status-lyrics';
  if (action === 'Submitted Song') return 'status-production';
  if (action === 'QA Approved') return 'status-completed';
  if (action === 'QA Rejected') return 'status-qa';
  return '';
}

// Bind viewOrderFromHistory globally so inline onclick handlers can access it
window.viewOrderFromHistory = async (orderId) => {
  if (!orderId) return;
  try {
    const orderRef = doc(db, 'orders', orderId);
    const orderSnap = await getDoc(orderRef);
    if (orderSnap.exists()) {
      openOrderModal(orderId, orderSnap.data());
    } else {
      showAlertModal("Order not found.", "Error", "error");
    }
  } catch (e) {
    console.error(e);
    showAlertModal("Error loading order details.", "Error", "error");
  }
};

// Set up local filter listeners
if (historyFilterArtist) {
  historyFilterArtist.addEventListener('change', renderHistory);
}
if (historyFilterAction) {
  historyFilterAction.addEventListener('change', renderHistory);
}

// --- Artist Details Modal & Statistics ---
async function openArtistModal(artistId, artistData) {
  if (!artistModal) return;
  
  modalArtistName.innerText = artistData.name || 'Unknown Artist';
  modalArtistEmail.innerText = artistData.email || 'N/A';
  modalArtistRole.innerText = (artistData.role || 'Artist').toUpperCase();
  modalArtistIncentives.innerText = `$${(artistData.incentives || 0).toFixed(2)}`;
  modalArtistPenalties.innerText = `$${(artistData.penalties || 0).toFixed(2)}`;
  modalArtistActive.innerText = artistData.activeTasks || 0;

  if (modalArtistResetPass) {
    modalArtistResetPass.dataset.email = artistData.email || '';
    modalArtistResetPass.dataset.name = artistData.name || '';
  }

  if (modalArtistSuspend) {
    modalArtistSuspend.dataset.id = artistId;
    modalArtistSuspend.dataset.name = artistData.name || '';
    modalArtistSuspend.dataset.suspended = artistData.suspended ? "true" : "false";
    modalArtistSuspend.innerText = artistData.suspended ? "Unsuspend Artist" : "Suspend Artist";
  }

  if (modalArtistDelete) {
    modalArtistDelete.dataset.id = artistId;
    modalArtistDelete.dataset.name = artistData.name || '';
  }

  if (modalArtistNotify) {
    modalArtistNotify.dataset.id = artistId;
    modalArtistNotify.dataset.name = artistData.name || '';
  }

  modalArtistOrdersList.dataset.artistId = artistId;
  modalArtistOrdersList.innerHTML = '<p class="text-center text-muted" style="width: 100%; padding: 2rem 0;">Loading assigned orders...</p>';
  artistModal.style.display = 'flex';

  try {
    const artistOrdersQ = query(collection(db, 'orders'), where('assignedArtistId', '==', artistId));
    const ordersSnap = await getDocs(artistOrdersQ);
    
    modalArtistOrdersList.innerHTML = '';
    
    let totalAssigned = 0;
    let completedCount = 0;
    let pendingCount = 0;
    
    if (ordersSnap.empty) {
      modalArtistOrdersList.innerHTML = '<p class="text-center text-muted" style="width: 100%; padding: 2rem 0;">No orders assigned.</p>';
    } else {
      const orders = [];
      ordersSnap.forEach(orderDoc => {
        totalAssigned++;
        const orderData = orderDoc.data();
        if (orderData.status === 'Completed' || orderData.status === 'Delivered' || orderData.status === 'Ready for Delivery') {
          completedCount++;
        } else {
          pendingCount++;
        }
        orders.push({ id: orderDoc.id, ...orderData });
      });

      // Sort in-memory by priority, with creation timestamp fallback
      orders.sort((a, b) => {
        const pA = a.priority !== undefined ? a.priority : 1000;
        const pB = b.priority !== undefined ? b.priority : 1000;
        if (pA !== pB) return pA - pB;
        
        const timeA = a.timestamps?.createdAt ? a.timestamps.createdAt.toMillis() : 0;
        const timeB = b.timestamps?.createdAt ? b.timestamps.createdAt.toMillis() : 0;
        return timeA - timeB;
      });

      orders.forEach(order => {
        modalArtistOrdersList.appendChild(createCompactOrderCard(order.id, order));
      });
    }

    modalArtistTotalAssigned.innerText = totalAssigned;
    modalArtistCompleted.innerText = completedCount;
    modalArtistPending.innerText = pendingCount;
    
  } catch (e) {
    console.error("Error loading artist details:", e);
    modalArtistOrdersList.innerHTML = '<p class="text-center text-muted text-danger" style="width: 100%; padding: 2rem 0;">Error loading orders.</p>';
  }
}

function getStatusClassForOrder(status) {
  const statusClasses = {
    'Pending Assignment': 'status-pending',
    'Lyrics In Progress': 'status-lyrics',
    'Song In Production': 'status-production',
    'Awaiting QA': 'status-qa',
    'Ready for Delivery': 'status-completed',
    'Completed': 'status-completed',
    'Delivered': 'status-completed'
  };
  return statusClasses[status] || 'status-pending';
}

if (closeArtistModalBtn) {
  closeArtistModalBtn.onclick = () => {
    artistModal.style.display = 'none';
  };
}

if (closeOrderModalBtn) {
  closeOrderModalBtn.onclick = () => {
    closeOrderModal();
  };
}

if (copyDetailsBtn) {
  copyDetailsBtn.onclick = async () => {
    if (!currentModalOrderData || !currentModalOrderData.customerData) return;
    const cd = currentModalOrderData.customerData;
    const formatted = `recipient: ${cd.recipient || 'N/A'}
name: ${cd.name || 'N/A'}
pronouns: ${cd.pronouns || 'N/A'}
occasion: ${cd.occasion || 'N/A'}
genre: ${cd.genre || 'N/A'}
mood: ${cd.mood || 'N/A'}
keywords: ${(cd.words && cd.words.length > 0) ? cd.words.join(', ') : 'None'}
occasion story: ${cd.occasionStory || 'None'}
memories & jokes: ${cd.memories || 'None'}`;
    
    try {
      await navigator.clipboard.writeText(formatted);
      const originalText = copyDetailsBtn.innerText;
      copyDetailsBtn.innerText = 'Copied!';
      setTimeout(() => {
        copyDetailsBtn.innerText = originalText;
      }, 2000);
    } catch (err) {
      console.error('Failed to copy details: ', err);
      showAlertModal('Failed to copy details to clipboard.', 'Error', 'error');
    }
  };
}

// --- Reusable Alert Modal ---
function showAlertModal(message, title = 'Notification', type = 'info') {
  if (!alertModal || !alertModalMessage || !alertModalTitle || !alertModalIcon) return;
  
  alertModalMessage.innerText = message;
  alertModalTitle.innerText = title;
  
  // Reset icon and class
  alertModalIcon.className = 'alert-icon-container';
  if (type === 'success') {
    alertModalIcon.innerText = '✓';
    alertModalIcon.classList.add('alert-icon--success');
  } else if (type === 'error') {
    alertModalIcon.innerText = '✕';
    alertModalIcon.classList.add('alert-icon--error');
  } else if (type === 'warning') {
    alertModalIcon.innerText = '⚠️';
    alertModalIcon.classList.add('alert-icon--warning');
  } else {
    alertModalIcon.innerText = 'ℹ️';
    alertModalIcon.classList.add('alert-icon--info');
  }
  
  alertModal.style.display = 'flex';
}

if (closeAlertModalBtn) {
  closeAlertModalBtn.onclick = () => {
    alertModal.style.display = 'none';
  };
}

// --- Logout Confirmation Modal Listeners ---
if (logoutCancelBtn) {
  logoutCancelBtn.onclick = () => {
    logoutConfirmModal.style.display = 'none';
  };
}
if (logoutConfirmBtn) {
  logoutConfirmBtn.onclick = () => {
    logoutConfirmModal.style.display = 'none';
    signOut(auth);
  };
}

// --- Change Password Form & Actions ---
if (sidebarChangePassBtn) {
  sidebarChangePassBtn.onclick = () => {
    if (changePassForm) changePassForm.reset();
    if (changePassMsg) changePassMsg.innerHTML = '';
    if (changePasswordModal) changePasswordModal.style.display = 'flex';
  };
}

if (closeChangePassModalBtn) {
  closeChangePassModalBtn.onclick = () => {
    changePasswordModal.style.display = 'none';
  };
}

if (changePassForm) {
  changePassForm.onsubmit = async (e) => {
    e.preventDefault();
    const newPass = document.getElementById('new-password').value;
    const confirmPass = document.getElementById('confirm-password').value;
    
    if (newPass !== confirmPass) {
      changePassMsg.className = 'error-msg mt-4';
      changePassMsg.innerText = 'Passwords do not match.';
      return;
    }
    
    if (newPass.length < 6) {
      changePassMsg.className = 'error-msg mt-4';
      changePassMsg.innerText = 'Password must be at least 6 characters.';
      return;
    }
    
    try {
      changePassMsg.className = 'mt-4';
      changePassMsg.innerText = 'Updating password...';
      
      await updatePassword(auth.currentUser, newPass);
      
      changePassMsg.className = 'success-msg mt-4';
      changePassMsg.innerText = 'Password updated successfully!';
      changePassForm.reset();
      
      setTimeout(() => {
        changePasswordModal.style.display = 'none';
      }, 1500);
    } catch (error) {
      console.error(error);
      changePassMsg.className = 'error-msg mt-4';
      changePassMsg.innerText = getFriendlyFirebaseErrorMessage(error, 'Failed to update password.');
    }
  };
}

// --- Admin Reset Artist Password Action ---
if (modalArtistResetPass) {
  modalArtistResetPass.onclick = async () => {
    const email = modalArtistResetPass.dataset.email;
    const name = modalArtistResetPass.dataset.name;
    if (!email) {
      showAlertModal("No email address found for this artist.", "Error", "error");
      return;
    }
    
    try {
      modalArtistResetPass.disabled = true;
      modalArtistResetPass.innerText = 'Sending...';
      
      await sendPasswordResetEmail(auth, email);
      
      showAlertModal(`A password reset link has been successfully sent to ${name} (${email}).`, "Reset Link Sent", "success");
    } catch (error) {
      console.error(error);
      showAlertModal(getFriendlyFirebaseErrorMessage(error, "Failed to send password reset email."), "Error", "error");
    } finally {
      modalArtistResetPass.disabled = false;
      modalArtistResetPass.innerText = 'Send Password Reset Link';
    }
  };
}

// --- Admin Suspend Artist Action ---
if (modalArtistSuspend) {
  modalArtistSuspend.onclick = async () => {
    const artistId = modalArtistSuspend.dataset.id;
    const artistName = modalArtistSuspend.dataset.name;
    const isSuspended = modalArtistSuspend.dataset.suspended === "true";
    if (!artistId) return;
    
    try {
      modalArtistSuspend.disabled = true;
      modalArtistSuspend.innerText = isSuspended ? 'Unsuspending...' : 'Suspending...';
      
      const newStatus = !isSuspended;
      await updateDoc(doc(db, 'users', artistId), {
        suspended: newStatus
      });
      
      const actionText = newStatus ? 'Suspended' : 'Unsuspended';
      const logText = newStatus ? `Suspended artist ${artistName}` : `Unsuspended artist ${artistName}`;
      
      await logActivity(currentUser.uid, userData.name, '', actionText + ' Artist', logText);
      
      showAlertModal(`Artist "${artistName}" has been ${actionText.toLowerCase()} successfully.`, `${actionText} Artist`, "success");
      if (artistModal) artistModal.style.display = 'none';
    } catch (error) {
      console.error(error);
      showAlertModal(getFriendlyFirebaseErrorMessage(error, "Failed to update artist suspension status."), "Error", "error");
    } finally {
      modalArtistSuspend.disabled = false;
      modalArtistSuspend.innerText = modalArtistSuspend.dataset.suspended === "true" ? "Unsuspend Artist" : "Suspend Artist";
    }
  };
}

// --- Admin Delete Artist Action ---
if (modalArtistDelete) {
  modalArtistDelete.onclick = () => {
    const artistId = modalArtistDelete.dataset.id;
    const artistName = modalArtistDelete.dataset.name;
    if (!artistId) return;
    
    if (deleteArtistNamePlaceholder) {
      deleteArtistNamePlaceholder.innerText = artistName;
    }
    if (deleteArtistConfirmBtn) {
      deleteArtistConfirmBtn.dataset.id = artistId;
      deleteArtistConfirmBtn.dataset.name = artistName;
    }
    if (deleteArtistConfirmModal) {
      deleteArtistConfirmModal.style.display = 'flex';
    }
  };
}

if (deleteArtistCancelBtn) {
  deleteArtistCancelBtn.onclick = () => {
    if (deleteArtistConfirmModal) {
      deleteArtistConfirmModal.style.display = 'none';
    }
  };
}

if (deleteArtistConfirmBtn) {
  deleteArtistConfirmBtn.onclick = async () => {
    const artistId = deleteArtistConfirmBtn.dataset.id;
    const artistName = deleteArtistConfirmBtn.dataset.name;
    if (!artistId) return;
    
    try {
      deleteArtistConfirmBtn.disabled = true;
      deleteArtistConfirmBtn.innerText = 'Deleting...';
      
      await deleteDoc(doc(db, 'users', artistId));
      
      await logActivity(currentUser.uid, userData.name, '', 'Deleted Artist', `Deleted artist ${artistName}`);
      
      if (deleteArtistConfirmModal) deleteArtistConfirmModal.style.display = 'none';
      if (artistModal) artistModal.style.display = 'none';
      
      showAlertModal(`Artist "${artistName}" has been successfully deleted.`, "Artist Deleted", "success");
    } catch (error) {
      console.error(error);
      showAlertModal(getFriendlyFirebaseErrorMessage(error, "Failed to delete artist."), "Error", "error");
    } finally {
      if (deleteArtistConfirmBtn) {
        deleteArtistConfirmBtn.disabled = false;
        deleteArtistConfirmBtn.innerText = 'Delete';
      }
    }
  };
}

// --- Admin Notify Artist Action (Redirect to Chat) ---
if (modalArtistNotify) {
  modalArtistNotify.onclick = () => {
    const artistId = modalArtistNotify.dataset.id;
    const artistName = modalArtistNotify.dataset.name;
    if (!artistId) return;

    // Close details modal
    if (artistModal) artistModal.style.display = 'none';

    // Switch nav to Messages
    const msgNavBtn = document.getElementById('nav-messages');
    if (msgNavBtn) {
      msgNavBtn.click();
    }

    // Select the artist in chat
    selectChatArtist(artistId, artistName);
  };
}

// --- Chat Actions & Methods ---
function selectChatArtist(artistId, name) {
  currentChatArtistId = artistId;
  if (chatActiveTitle) chatActiveTitle.innerText = `Chat with ${name}`;
  if (adminChatForm) adminChatForm.style.display = 'flex';
  if (adminChatDeleteAllBtn) adminChatDeleteAllBtn.style.display = 'inline-flex';
  
  // Highlight active item
  renderChatArtistList();
  
  // Mobile: Switch to chat area view
  const layout = document.getElementById('admin-messages-layout');
  if (layout) layout.classList.add('mobile-chat-active');
  
  listenToChat(artistId, adminChatMessages);
}

// Mobile Back Button for Chat Area
const mobileChatBackBtn = document.getElementById('mobile-chat-back-btn');
if (mobileChatBackBtn) {
  mobileChatBackBtn.addEventListener('click', () => {
    const layout = document.getElementById('admin-messages-layout');
    if (layout) layout.classList.remove('mobile-chat-active');
  });
}

function renderChatArtistList() {
  if (!chatArtistList) return;
  chatArtistList.innerHTML = '';
  localArtists.forEach(art => {
    const item = document.createElement('div');
    item.className = `chat-artist-item ${art.id === currentChatArtistId ? 'active' : ''}`;
    item.onclick = () => selectChatArtist(art.id, art.name);
    
    const unread = unreadMessagesCount[art.id] || 0;
    const badge = unread > 0 ? `<span class="chat-unread-badge">${unread}</span>` : '';
    
    item.innerHTML = `
      <span class="chat-artist-name">${art.name}</span>
      ${badge}
    `;
    chatArtistList.appendChild(item);
  });
}

function listenToChat(artistId, containerElement) {
  if (unsubscribeChatMessages) unsubscribeChatMessages();
  
  const chatQ = query(
    collection(db, 'messages'),
    where('artistId', '==', artistId)
  );
  
  unsubscribeChatMessages = onSnapshot(chatQ, (snapshot) => {
    containerElement.innerHTML = '';
    if (snapshot.empty) {
      containerElement.innerHTML = '<p class="text-muted text-center" style="margin: auto; padding: 2rem;">No messages yet. Send a message to start the conversation!</p>';
      return;
    }
    
    // Client-side sort to bypass composite index requirements
    const messages = [];
    snapshot.forEach(docSnap => {
      messages.push({ id: docSnap.id, ...docSnap.data() });
    });
    
    messages.sort((a, b) => {
      const timeA = a.timestamp ? a.timestamp.toMillis() : Date.now();
      const timeB = b.timestamp ? b.timestamp.toMillis() : Date.now();
      return timeA - timeB;
    });
    
    messages.forEach(msg => {
      // Mark as read if received by current user and unread
      if (msg.senderId !== currentUser.uid && !msg.read) {
        updateDoc(doc(db, 'messages', msg.id), { read: true });
      }
      
      const bubble = document.createElement('div');
      const isSent = msg.senderId === currentUser.uid;
      bubble.className = `chat-bubble ${isSent ? 'sent' : 'received'}`;
      
      const timeStr = msg.timestamp ? msg.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      
      bubble.innerHTML = `
        <span class="chat-bubble-text">${msg.message}</span>
        <span class="chat-bubble-time">${timeStr}</span>
      `;
      containerElement.appendChild(bubble);
    });
    
    // Scroll to bottom
    containerElement.scrollTop = containerElement.scrollHeight;
  });
}

if (adminChatForm) {
  adminChatForm.onsubmit = async (e) => {
    e.preventDefault();
    const msgText = adminChatInput.value.trim();
    if (!msgText || !currentChatArtistId) return;
    
    adminChatInput.value = '';
    try {
      await addDoc(collection(db, 'messages'), {
        artistId: currentChatArtistId,
        message: msgText,
        senderId: currentUser.uid,
        senderName: userData ? (userData.name || 'Admin') : 'Admin',
        timestamp: serverTimestamp(),
        read: false
      });
    } catch (err) {
      console.error(err);
    }
  };
}

if (adminChatDeleteAllBtn) {
  adminChatDeleteAllBtn.addEventListener('click', async () => {
    if (!currentChatArtistId) return;
    
    if (confirm("Are you sure you want to delete all messages in this conversation? This cannot be undone.")) {
      try {
        adminChatDeleteAllBtn.disabled = true;
        adminChatDeleteAllBtn.innerText = 'Deleting...';
        
        const chatQ = query(
          collection(db, 'messages'),
          where('artistId', '==', currentChatArtistId)
        );
        const snapshot = await getDocs(chatQ);
        
        const deletePromises = [];
        snapshot.forEach(docSnap => {
          deletePromises.push(deleteDoc(doc(db, 'messages', docSnap.id)));
        });
        
        await Promise.all(deletePromises);
        
      } catch (err) {
        console.error("Error deleting messages: ", err);
        showAlertModal("Failed to delete messages.", "Error", "error");
      } finally {
        adminChatDeleteAllBtn.disabled = false;
        adminChatDeleteAllBtn.innerText = 'Delete All';
      }
    }
  });
}

if (artistChatForm) {
  artistChatForm.onsubmit = async (e) => {
    e.preventDefault();
    const msgText = artistChatInput.value.trim();
    if (!msgText) return;
    
    artistChatInput.value = '';
    try {
      await addDoc(collection(db, 'messages'), {
        artistId: currentUser.uid,
        message: msgText,
        senderId: currentUser.uid,
        senderName: userData ? (userData.name || 'Artist') : 'Artist',
        timestamp: serverTimestamp(),
        read: false
      });
    } catch (err) {
      console.error(err);
    }
  };
}

function updateMessagesNavBadge(count) {
  if (!messagesNavBadge) return;
  if (count > 0) {
    messagesNavBadge.innerText = count;
    messagesNavBadge.style.display = 'inline-block';
  } else {
    messagesNavBadge.style.display = 'none';
  }
}

function getFriendlyFirebaseErrorMessage(error, defaultMessage = 'An unexpected error occurred.') {
  if (!error || !error.code) return error ? (error.message || defaultMessage) : defaultMessage;
  
  switch (error.code) {
    // Auth Errors
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'Invalid email address or password. Please verify your credentials and try again.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address format.';
    case 'auth/email-already-in-use':
      return 'This email address is already registered to another account.';
    case 'auth/weak-password':
      return 'The password is too weak. It must be at least 6 characters.';
    case 'auth/too-many-requests':
      return 'Too many failed login attempts. Your account has been temporarily locked. Please try again later.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Please contact support for assistance.';
    case 'auth/requires-recent-login':
      return 'This action requires recent authentication. Please log out and log back in to continue.';
    case 'auth/network-request-failed':
      return 'Network connection failed. Please check your internet connection and try again.';
      
    // Firestore Errors
    case 'permission-denied':
      return 'You do not have permission to perform this action.';
    case 'unavailable':
      return 'The database is temporarily offline. Please check your network connection and try again.';
      
    default:
      return error.message || defaultMessage;
  }
}

// --- Drag and Drop Helper System ---
function setupDragAndDrop(container, onReorder) {
  let draggedEl = null;

  container.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.order-card, .compact-order-card');
    if (!card) return;
    draggedEl = card;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });

  container.addEventListener('dragend', (e) => {
    const card = e.target.closest('.order-card, .compact-order-card');
    if (card) {
      card.classList.remove('dragging');
    }
    // Clean up drag-over classes
    Array.from(container.children).forEach(child => {
      child.classList.remove('drag-over');
    });
    
    if (onReorder && draggedEl) {
      onReorder();
    }
    draggedEl = null;
  });

  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    const card = e.target.closest('.order-card, .compact-order-card');
    if (!card || card === draggedEl) return;

    card.classList.add('drag-over');
    
    const rect = card.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    if (e.clientY < midY) {
      container.insertBefore(draggedEl, card);
    } else {
      container.insertBefore(draggedEl, card.nextSibling);
    }
  });

  container.addEventListener('dragleave', (e) => {
    const card = e.target.closest('.order-card, .compact-order-card');
    if (card && card !== draggedEl) {
      card.classList.remove('drag-over');
    }
  });
}

async function handleTasksReorder() {
  const cards = Array.from(tasksList.querySelectorAll('.order-card'));
  const orderIds = cards.map(c => c.dataset.id).filter(Boolean);
  
  try {
    const promises = orderIds.map((id, index) => {
      const orderRef = doc(db, 'orders', id);
      return updateDoc(orderRef, { priority: index });
    });
    await Promise.all(promises);
    showReorderToast("Tasks priority updated successfully!");
  } catch (error) {
    console.error("Error updating tasks order:", error);
    showAlertModal("Could not save the new task order to database.", "Save Error", "error");
  }
}

async function handleArtistModalReorder(artistId) {
  if (!artistId) return;
  const cards = Array.from(modalArtistOrdersList.querySelectorAll('.compact-order-card'));
  const orderIds = cards.map(c => c.dataset.id).filter(Boolean);
  
  try {
    const promises = orderIds.map((id, index) => {
      const orderRef = doc(db, 'orders', id);
      return updateDoc(orderRef, { priority: index });
    });
    await Promise.all(promises);
    showReorderToast("Artist task priority updated!");
  } catch (error) {
    console.error("Error updating artist task order:", error);
    showAlertModal("Could not save the new task order to database.", "Save Error", "error");
  }
}

function showReorderToast(message) {
  const existing = document.querySelector('.reorder-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'reorder-toast';
  toast.innerHTML = `<span>✓</span> <span>${message}</span>`;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('fade-out');
    toast.addEventListener('animationend', () => {
      toast.remove();
    });
  }, 2000);
}

