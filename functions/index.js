/* ═══════════════════════════════════════════════════════════════
   LYRICASTUDIOS — Firebase Cloud Functions (Gen 1)
   Secure Lemon Squeezy Payment Processing (Merchant of Record)
   ═══════════════════════════════════════════════════════════════ */

const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const axios = require("axios");

admin.initializeApp();

/**
 * createCheckoutSession
 * ---------------------
 * Called by the frontend when the customer clicks checkout.
 * Saves form data to pending_orders in Firestore and generates a Lemon Squeezy checkout URL.
 */
exports.createCheckoutSession = functions
  .runWith({ secrets: ["LEMON_SQUEEZY_API_KEY"] })
  .https.onCall(async (data, context) => {
    const db = admin.firestore();

    const email = (data.email || "").trim().toLowerCase();
    const deliveryType = data.deliveryType || "standard";
    const formData = data.formData;

    if (!email || !formData) {
      throw new functions.https.HttpsError("invalid-argument", "Email and form data are required.");
    }

    // 1. Save order to pending_orders in Firestore
    let pendingOrderId;
    try {
      const pendingOrderRef = await db.collection("pending_orders").add({
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
          deliveryType: deliveryType,
          price: deliveryType === "rush" ? "$89.00" : "$79.00",
        },
        status: "Pending Payment",
        paymentStatus: "unpaid",
        promoCodeUsed: null,
        timestamps: {
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        }
      });
      pendingOrderId = pendingOrderRef.id;
    } catch (err) {
      console.error("Failed to write pending order to Firestore:", err);
      throw new functions.https.HttpsError("internal", "Failed to initialize order. Please try again.");
    }

    // 2. Retrieve configuration settings
    const storeId = process.env.LEMON_SQUEEZY_STORE_ID || "409961";
    const standardVariantId = process.env.LEMON_SQUEEZY_STANDARD_VARIANT_ID || "1802118";
    const rushVariantId = process.env.LEMON_SQUEEZY_RUSH_VARIANT_ID || "1802132";

    const variantId = standardVariantId;

    if (!process.env.LEMON_SQUEEZY_API_KEY) {
      console.error("Missing LEMON_SQUEEZY_API_KEY environment secret.");
      throw new functions.https.HttpsError("failed-precondition", "Payment gateway is not configured.");
    }

    // 3. Create checkout session via Lemon Squeezy API
    try {
      const response = await axios.post(
        "https://api.lemonsqueezy.com/v1/checkouts",
        {
          data: {
            type: "checkouts",
            attributes: {
              checkout_data: {
                email: email,
                custom: {
                  pendingOrderId: pendingOrderId,
                },
              },
            },
            relationships: {
              store: {
                data: {
                  type: "stores",
                  id: storeId.toString(),
                },
              },
              variant: {
                data: {
                  type: "variants",
                  id: variantId.toString(),
                },
              },
            },
          },
        },
        {
          headers: {
            Accept: "application/vnd.api+json",
            "Content-Type": "application/vnd.api+json",
            Authorization: `Bearer ${process.env.LEMON_SQUEEZY_API_KEY.trim()}`,
          },
        }
      );

      const checkoutUrl = response.data.data.attributes.url;

      return {
        checkoutUrl: checkoutUrl,
        pendingOrderId: pendingOrderId,
      };
    } catch (err) {
      console.error("Lemon Squeezy checkout creation failed:", err.response ? err.response.data : err.message);
      
      if (err.response && err.response.data && Array.isArray(err.response.data.errors)) {
        const firstError = err.response.data.errors[0];
        if (firstError && firstError.detail && firstError.detail.toLowerCase().includes("discount code")) {
          throw new functions.https.HttpsError(
            "invalid-argument",
            "Invalid promo code."
          );
        }
      }
      
      throw new functions.https.HttpsError("internal", "Failed to generate checkout session. Please try again.");
    }
  });

/**
 * handleMoRWebhook
 * ----------------
 * HTTP webhook receiver for Lemon Squeezy payment notifications.
 * Verifies signature, processes successful orders, and moves them to orders collection.
 */
exports.handleMoRWebhook = functions
  .runWith({ secrets: ["LEMON_SQUEEZY_WEBHOOK_SECRET"] })
  .https.onRequest(async (req, res) => {
    const crypto = require("crypto");
    const db = admin.firestore();

    const webhookSecret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("Missing LEMON_SQUEEZY_WEBHOOK_SECRET secret.");
      res.status(500).send("Webhook secret not configured.");
      return;
    }

    // 1. Verify webhook signature
    const signature = req.get("X-Signature") || "";
    if (!signature) {
      console.error("Missing X-Signature header.");
      res.status(401).send("Missing signature.");
      return;
    }

    const hmac = crypto.createHmac("sha256", webhookSecret.trim());
    const digest = hmac.update(req.rawBody).digest("hex");

    if (!crypto.timingSafeEqual(Buffer.from(digest, "utf8"), Buffer.from(signature, "utf8"))) {
      console.error("Signature verification failed.");
      res.status(401).send("Invalid signature.");
      return;
    }

    // 2. Process event
    const event = req.body;
    const eventName = event.meta ? event.meta.event_name : null;

    console.log(`Received Lemon Squeezy event: ${eventName}`);

    if (eventName === "order_created") {
      const customData = event.meta.custom_data || {};
      const pendingOrderId = customData.pendingOrderId;

      if (!pendingOrderId) {
        console.warn("No pendingOrderId found in webhook custom metadata.");
        res.status(200).send("Ignored: No pendingOrderId.");
        return;
      }

      try {
        const pendingOrderRef = db.collection("pending_orders").doc(pendingOrderId);
        const pendingOrderSnap = await pendingOrderRef.get();

        if (!pendingOrderSnap.exists) {
          console.error(`Pending order ${pendingOrderId} not found in Firestore.`);
          res.status(404).send("Pending order not found.");
          return;
        }

        const pendingOrder = pendingOrderSnap.data();

        // Prevent duplicate order creation if webhook retried
        const existingOrder = await db
          .collection("orders")
          .where("paymentIntentId", "==", event.data.id.toString())
          .limit(1)
          .get();

        if (!existingOrder.empty) {
          console.log(`Order already processed for Lemon Squeezy order: ${event.data.id}`);
          res.status(200).send("Already processed.");
          return;
        }

        const orderAttributes = event.data.attributes || {};
        
        const purchasedVariantId = (event.data.relationships?.variant?.data?.id || "").toString();
        const rushVariantId = process.env.LEMON_SQUEEZY_RUSH_VARIANT_ID || "1802132";
        const actualDeliveryType = purchasedVariantId === rushVariantId.toString() ? "rush" : "standard";
        const actualPrice = purchasedVariantId === rushVariantId.toString() ? "$89.00" : "$79.00";

        const updatedCustomerData = {
          ...pendingOrder.customerData,
          deliveryType: actualDeliveryType,
          price: actualPrice
        };

        const orderData = {
          customerData: updatedCustomerData,
          status: "Pending Assignment",
          assignedArtistId: null,
          paymentIntentId: event.data.id.toString(),
          paymentStatus: "paid",
          promoCodeUsed: pendingOrder.promoCodeUsed || orderAttributes.discount_code || null,
          discountInfo: {
            discountTotal: orderAttributes.discount_total || 0,
            discountTotalFormatted: orderAttributes.discount_total_formatted || "$0.00",
            discountTotalUsd: orderAttributes.discount_total_usd || 0,
          },
          paymentInfo: {
            subtotal: orderAttributes.subtotal || 0,
            subtotalFormatted: orderAttributes.subtotal_formatted || "",
            tax: orderAttributes.tax || 0,
            taxFormatted: orderAttributes.tax_formatted || "",
            total: orderAttributes.total || 0,
            totalFormatted: orderAttributes.total_formatted || "",
          },
          timestamps: {
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            paidAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          assets: {},
        };

        // Batch write: Add to orders and delete from pending_orders
        const batch = db.batch();
        const newOrderRef = db.collection("orders").doc();
        batch.set(newOrderRef, orderData);
        batch.delete(pendingOrderRef);

        await batch.commit();
        console.log(`Successfully completed order ${newOrderRef.id} from pending order ${pendingOrderId}`);

      } catch (err) {
        console.error("Error processing order during webhook:", err);
        res.status(500).send("Internal processing error.");
        return;
      }
    }

    res.status(200).send("Webhook event processed.");
  });
