(function (window2) {
  "use strict";
  let razorpayScriptLoaded = false;
  let razorpayScriptLoading = false;

  function loadRazorpaySdk() {
    return new Promise((resolve, reject) => {
      if (window2.Razorpay) {
        razorpayScriptLoaded = true;
        return resolve(window2.Razorpay);
      }
      if (razorpayScriptLoading) {
        const interval = setInterval(() => {
          if (window2.Razorpay) {
            clearInterval(interval);
            resolve(window2.Razorpay);
          }
        }, 100);
        return;
      }
      razorpayScriptLoading = true;
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => {
        razorpayScriptLoaded = true;
        razorpayScriptLoading = false;
        resolve(window2.Razorpay);
      };
      script.onerror = () => {
        razorpayScriptLoading = false;
        reject(new Error("Failed to load Razorpay checkout SDK"));
      };
      document.head.appendChild(script);
    });
  }

  async function reportOrderCancelled(orderId, providerOrderId, reason) {
    if (!orderId && !providerOrderId) return;
    try {
      await fetch("/api/commerce/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          orderId: orderId || null,
          providerOrderId: providerOrderId || null,
          reason: reason || "USER_CANCELLED_CHECKOUT"
        })
      });
    } catch (e) {
      console.warn("[WishPaymentService] Could not report cancelled order:", e);
    }
  }

  async function reportOrderFailed(orderId, providerOrderId, razorpayPaymentId, errorCode, errorDescription) {
    if (!orderId && !providerOrderId) return;
    try {
      await fetch("/api/commerce/fail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          orderId: orderId || null,
          providerOrderId: providerOrderId || null,
          razorpayPaymentId: razorpayPaymentId || null,
          errorCode: errorCode || "PAYMENT_FAILED",
          errorDescription: errorDescription || "Payment failed or was declined"
        })
      });
    } catch (e) {
      console.warn("[WishPaymentService] Could not report failed order:", e);
    }
  }

  const WishPaymentService = {
    async getAvailablePlans() {
      const ls = window2._cachedWishLinkSettings;
      if (ls && Array.isArray(ls.vipPlans) && ls.vipPlans.length > 0) {
        return ls.vipPlans
          .filter((p) => p && p.isActive !== false)
          .map((p) => ({
            id: p.id,
            name: p.name,
            badge: p.badge,
            price: Number(p.price ?? 19),
            currency: (ls.personalized && ls.personalized.currency) || "INR",
            perks: p.perks || {},
            features: p.features || []
          }));
      }
      return [
        { id: "personalized_link", name: "Custom Link", price: 19, currency: "INR" },
        { id: "hd_photos", name: "HD Photos", price: 19, currency: "INR" },
        { id: "custom_link_1yr", name: "1-Year Custom Link", price: 149, currency: "INR" }
      ];
    },

    async createCheckout(productId = "personalized_link", options = {}) {
      const cleanOptions = options && typeof options === "object" ? options : {};
      const templateId =
        cleanOptions.templateId ||
        (String(productId).startsWith("template:") ? String(productId).split(":")[1] : null);
      const requestedSlug = cleanOptions.requestedSlug || cleanOptions.slug || null;
      const wishId = cleanOptions.wishId || null;

      let res;
      let data;
      try {
        res = await fetch("/api/commerce/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            productId,
            planId: productId,
            templateId,
            wishId,
            requestedSlug,
            options: {
              ...cleanOptions,
              planId: productId,
              templateId,
              wishId,
              slug: requestedSlug,
              requestedSlug
            }
          })
        });
        data = await res.json();
      } catch (networkErr) {
        const msg = "Network error contacting checkout server: " + networkErr.message;
        if (window2.WishToast) {
          window2.WishToast.show({ title: "Checkout Error", message: msg, type: "error" });
        }
        return { success: false, verified: false, error: msg };
      }

      if (
        res.status === 503 ||
        data.status === "provider_not_configured" ||
        data.configured === false ||
        data.error?.code === "PAYMENT_PROVIDER_NOT_CONFIGURED"
      ) {
        const message =
          data.error?.message ||
          data.message ||
          "Payment gateway (Razorpay) is not configured in server environment variables. Live checkout is currently unavailable.";
        if (window2.WishToast) {
          window2.WishToast.show({ title: "Gateway Not Configured", message, type: "warning" });
        }
        return {
          success: false,
          verified: false,
          status: "provider_not_configured",
          message,
          amount: data.amount,
          currency: data.currency,
          product: data.product,
          breakdown: data.breakdown || null
        };
      }

      if (!res.ok || !data.success) {
        const errMsg = data.error?.message || data.message || "Failed to initialize checkout";
        if (window2.WishToast) {
          window2.WishToast.show({ title: "Checkout Failed", message: errMsg, type: "error" });
        }
        return { success: false, verified: false, error: errMsg };
      }

      if (data.status === "FREE_NO_PAYMENT_REQUIRED" || Number(data.amount || 0) <= 0) {
        return {
          success: true,
          verified: true,
          status: "FREE_NO_PAYMENT_REQUIRED",
          amount: 0,
          validityDays: data.validityDays || 30,
          linkDuration: data.linkDuration || "standard",
          breakdown: data.breakdown || null
        };
      }

      try {
        await loadRazorpaySdk();
      } catch (sdkErr) {
        await reportOrderFailed(data.orderId, data.providerOrderId, null, "SDK_LOAD_ERROR", sdkErr.message);
        if (window2.WishToast) {
          window2.WishToast.show({
            title: "Payment Gateway Error",
            message: "Could not load payment gateway client: " + sdkErr.message,
            type: "error"
          });
        }
        return { success: false, verified: false, error: sdkErr.message };
      }

      return new Promise((resolve) => {
        let settled = false;
        const finishOnce = (payload) => {
          if (!settled) {
            settled = true;
            resolve(payload);
          }
        };

        const rzpOptions = {
          key: data.keyId,
          amount: data.amountPaise,
          currency: data.currency,
          name: "WishMagic",
          description: data.productName || "WishMagic Unlock",
          order_id: data.providerOrderId,
          notes: {
            orderId: String(data.orderId || ""),
            productId: String(data.productId || productId || ""),
            templateId: String(data.templateId || templateId || ""),
            requestedSlug: String(data.requestedSlug || requestedSlug || ""),
            linkDuration: String(data.linkDuration || "standard")
          },
          theme: { color: "#7C3AED" },
          modal: {
            ondismiss: async function () {
              if (!settled) {
                await reportOrderCancelled(data.orderId, data.providerOrderId, "USER_DISMISSED_MODAL");
                if (window2.WishToast) {
                  window2.WishToast.show({
                    title: "Payment Cancelled",
                    message: "Payment was cancelled. No access was granted.",
                    type: "warning"
                  });
                }
                finishOnce({ success: false, verified: false, status: "cancelled", orderId: data.orderId });
              }
            }
          },
          handler: async function (paymentResponse) {
            if (window2.WishToast) {
              window2.WishToast.show({
                title: "Verifying Payment...",
                message: "Authorizing transaction with payment gateway...",
                type: "info"
              });
            }
            try {
              const verifyRes = await fetch("/api/commerce/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                  orderId: data.orderId,
                  razorpayOrderId: paymentResponse.razorpay_order_id,
                  razorpayPaymentId: paymentResponse.razorpay_payment_id,
                  razorpaySignature: paymentResponse.razorpay_signature,
                  templateId: data.templateId || templateId || null,
                  wishId: wishId || null,
                  requestedSlug: data.requestedSlug || requestedSlug || null
                })
              });
              const verifyData = await verifyRes.json();
              if (
                verifyRes.ok &&
                verifyData.success &&
                (verifyData.status === "PAID" || verifyData.order?.status === "PAID")
              ) {
                if (window2.WishEntitlement && typeof window2.WishEntitlement.refresh === "function") {
                  try {
                    await window2.WishEntitlement.refresh();
                  } catch {}
                }
                if (window2.WishToast) {
                  window2.WishToast.show({
                    title: "Payment Verified! 👑",
                    message: `${data.productName || "Your purchase"} is now unlocked for your account.`,
                    type: "success"
                  });
                }
                finishOnce({
                  success: true,
                  verified: true,
                  status: "PAID",
                  orderId: data.orderId,
                  amount: data.amount,
                  validityDays: data.validityDays || 30,
                  linkDuration: data.linkDuration || "standard",
                  breakdown: data.breakdown || null,
                  order: verifyData.order,
                  entitlement: verifyData.entitlement
                });
              } else {
                const failMsg = verifyData.error?.message || verifyData.message || "Payment verification failed";
                await reportOrderFailed(
                  data.orderId,
                  paymentResponse.razorpay_order_id || data.providerOrderId,
                  paymentResponse.razorpay_payment_id,
                  verifyData.error?.code || "VERIFICATION_FAILED",
                  failMsg
                );
                if (window2.WishToast) {
                  window2.WishToast.show({ title: "Verification Failed", message: failMsg, type: "error" });
                }
                finishOnce({
                  success: false,
                  verified: false,
                  status: "verification_failed",
                  orderId: data.orderId,
                  error: failMsg
                });
              }
            } catch (vErr) {
              finishOnce({
                success: false,
                verified: false,
                status: "verification_error",
                orderId: data.orderId,
                error: "Verification network error: " + vErr.message
              });
            }
          }
        };

        const rzp = new window2.Razorpay(rzpOptions);
        if (typeof rzp.on === "function") {
          rzp.on("payment.failed", async function (failResponse) {
            const errObj = (failResponse && failResponse.error) || {};
            const errCode = errObj.code || "PAYMENT_FAILED";
            const errDesc = errObj.description || errObj.reason || "Payment failed or was declined by your bank.";
            const failedPayId = (errObj.metadata && errObj.metadata.payment_id) || null;
            const failedOrdId = (errObj.metadata && errObj.metadata.order_id) || data.providerOrderId;
            await reportOrderFailed(data.orderId, failedOrdId, failedPayId, errCode, errDesc);
            if (window2.WishToast) {
              window2.WishToast.show({ title: "Payment Failed", message: errDesc, type: "error" });
            }
            finishOnce({
              success: false,
              verified: false,
              status: "failed",
              orderId: data.orderId,
              error: errDesc,
              errorCode: errCode
            });
          });
        }
        rzp.open();
      });
    },

    async cancelOrder(orderId, providerOrderId, reason) {
      return reportOrderCancelled(orderId, providerOrderId, reason);
    },

    async getUserOrders() {
      try {
        const res = await fetch("/api/commerce/orders", { credentials: "include" });
        return await res.json();
      } catch (e) {
        return { success: false, error: e.message, orders: [] };
      }
    }
  };

  window2.WishPaymentService = WishPaymentService;
})(typeof window !== "undefined" ? window : globalThis);
