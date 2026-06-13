/* ═══════════════════════════════════════════════════════════════
   LYRICASTUDIOS — Firebase Cloud Functions (Gen 1)
   Secure Stripe Payment Processing
   ═══════════════════════════════════════════════════════════════ */

const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

admin.initializeApp();

/**
 * createPaymentIntent
 * -------------------
 * Called by the frontend when the customer clicks "Pay".
 * Calculates the correct price server-side (prevents tampering),
 * validates any promo code, and creates a Stripe PaymentIntent.
 *
 * @param {object} data - { email, deliveryType, promoCode? }
 * @returns {object} - { clientSecret, finalPrice }
 */
exports.createStripePaymentIntent = functions
  .runWith({ secrets: ["STRIPE_SECRET_KEY"] })
  .https.onCall(async (data, context) => {
    const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY.trim());
    const db = admin.firestore();

    // ── Validate required fields ────────────────────────────
    const email = (data.email || "").trim().toLowerCase();
    const deliveryType = data.deliveryType || "standard";

    if (!email) {
      throw new functions.https.HttpsError("invalid-argument", "Email is required.");
    }

    // ── Calculate base price (server-authoritative) ─────────
    let basePrice;
    if (deliveryType === "rush") {
      basePrice = 89;
    } else {
      basePrice = 79;
    }

    // ── Validate promo code (if provided) ───────────────────
    let discountAmount = 0;
    let validatedPromoCode = null;
    const promoCode = (data.promoCode || "").trim().toUpperCase();

    if (promoCode) {
      // Check if this email already used this promo code
      const userPromoId = `${email}_${promoCode}`;
      const usedPromoSnap = await db
        .collection("used_promos")
        .doc(userPromoId)
        .get();

      if (usedPromoSnap.exists) {
        throw new functions.https.HttpsError(
          "already-exists",
          "This promo code has already been used by this email address."
        );
      }

      // Look up the promo code
      const promoSnap = await db
        .collection("promo_codes")
        .doc(promoCode)
        .get();

      if (promoSnap.exists) {
        const promoData = promoSnap.data();
        validatedPromoCode = promoData.code || promoCode;

        if (promoData.discountType === "percentage") {
          discountAmount = basePrice * (parseFloat(promoData.discountValue) / 100);
        } else {
          discountAmount = parseFloat(promoData.discountValue);
        }

        // Cap discount at base price
        if (discountAmount > basePrice) {
          discountAmount = basePrice;
        }
      } else {
        throw new functions.https.HttpsError("not-found", "Invalid promo code.");
      }
    }

    // ── Calculate final price ───────────────────────────────
    const finalPrice = Math.round((basePrice - discountAmount) * 100); // cents

    if (finalPrice <= 0) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Total price must be greater than zero."
      );
    }

    // ── Create Stripe PaymentIntent ─────────────────────────
    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: finalPrice,
        currency: "usd",
        metadata: {
          email: email,
          deliveryType: deliveryType,
          promoCode: validatedPromoCode || "",
          basePriceCents: basePrice * 100,
          discountCents: Math.round(discountAmount * 100),
        },
      });

      return {
        clientSecret: paymentIntent.client_secret,
        finalPrice: finalPrice / 100, // dollars for display
      };
    } catch (error) {
      console.error("Stripe PaymentIntent creation failed:", error);
      throw new functions.https.HttpsError("internal", "Failed to create payment. Please try again.");
    }
  });

/**
 * confirmOrder
 * ------------
 * Called by the frontend after Stripe confirms the payment succeeded.
 * Verifies the PaymentIntent status with Stripe, then writes the
 * order to Firestore and marks any promo code as used.
 *
 * @param {object} data - { paymentIntentId, formData }
 * @returns {object} - { success: true }
 */
exports.confirmStripeOrder = functions
  .runWith({ secrets: ["STRIPE_SECRET_KEY"] })
  .https.onCall(async (data, context) => {
    const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY.trim());
    const db = admin.firestore();

    const paymentIntentId = data.paymentIntentId;
    const formData = data.formData;

    if (!paymentIntentId || !formData) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Payment intent ID and form data are required."
      );
    }

    // ── Verify payment with Stripe ──────────────────────────
    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    } catch (error) {
      console.error("Failed to retrieve PaymentIntent:", error);
      throw new functions.https.HttpsError("not-found", "Payment not found.");
    }

    if (paymentIntent.status !== "succeeded") {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Payment has not been completed successfully."
      );
    }

    // ── Prevent duplicate order creation ────────────────────
    const existingOrder = await db
      .collection("orders")
      .where("paymentIntentId", "==", paymentIntentId)
      .limit(1)
      .get();

    if (!existingOrder.empty) {
      // Order already exists — return success without creating duplicate
      return { success: true, message: "Order already exists." };
    }

    // ── Build the order document ────────────────────────────
    const email = (formData.email || "").trim().toLowerCase();
    const promoCode = paymentIntent.metadata.promoCode || null;
    const basePriceCents = parseInt(paymentIntent.metadata.basePriceCents) || 7900;
    const discountCents = parseInt(paymentIntent.metadata.discountCents) || 0;

    const orderData = {
      customerData: {
        recipient: formData.recipient || "",
        name: formData.name || "",
        pronouns: formData.pronouns || "",
        occasion: formData.occasion || "",
        occasionStory: formData.occasionStory || "",
        genre: formData.genre || "",
        preferredVoice: formData.preferredVoice || "",
        email: email,
        memories: formData.memories || "",
        words: formData.words || [],
        plan: formData.plan || "standard",
        deliveryType: formData.deliveryType || "standard",
        price: `$${(paymentIntent.amount / 100).toFixed(2)}`,
        originalPrice: `$${(basePriceCents / 100).toFixed(2)}`,
        promoCodeUsed: promoCode,
        discountApplied: discountCents > 0 ? `$${(discountCents / 100).toFixed(2)}` : null,
      },
      status: "Pending Assignment",
      assignedArtistId: null,
      paymentIntentId: paymentIntentId,
      paymentStatus: "paid",
      timestamps: {
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      assets: {},
    };

    // ── Write order + mark promo as used (atomic batch) ─────
    const batch = db.batch();

    const orderRef = db.collection("orders").doc();
    batch.set(orderRef, orderData);

    if (promoCode && email) {
      const userPromoId = `${email}_${promoCode}`;
      const usedPromoRef = db.collection("used_promos").doc(userPromoId);
      batch.set(usedPromoRef, {
        email: email,
        promoCode: promoCode,
        usedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    try {
      await batch.commit();
    } catch (error) {
      console.error("Failed to write order to Firestore:", error);
      throw new functions.https.HttpsError("internal", "Failed to save order. Please contact support.");
    }

    return { success: true };
  });
