// WishMagic Complete Production Payment & Commerce Service (Part 32)
// Real Razorpay Gateway + Checkout Modal + Cryptographic Verification + Orders

(function(window) {
  'use strict';

  let razorpayScriptLoaded = false;
  let razorpayScriptLoading = false;

  function loadRazorpaySdk() {
    return new Promise((resolve, reject) => {
      if (window.Razorpay) {
        razorpayScriptLoaded = true;
        return resolve(window.Razorpay);
      }
      if (razorpayScriptLoading) {
        const interval = setInterval(() => {
          if (window.Razorpay) {
            clearInterval(interval);
            resolve(window.Razorpay);
          }
        }, 100);
        return;
      }
      razorpayScriptLoading = true;
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => {
        razorpayScriptLoaded = true;
        razorpayScriptLoading = false;
        resolve(window.Razorpay);
      };
      script.onerror = () => {
        razorpayScriptLoading = false;
        reject(new Error('Failed to load Razorpay checkout SDK'));
      };
      document.head.appendChild(script);
    });
  }

  const WishPaymentService = {
    /**
     * Get available monetization plans
     */
    async getAvailablePlans() {
      if (window.WishPlanService) {
        return window.WishPlanService.getAllPlans();
      }
      return [
        { id: 'free', name: 'Free Tier', price: 0, currency: 'INR' },
        { id: 'vip_pass', name: 'VIP Magic Pass', price: 49, currency: 'INR' },
        { id: 'personalized_link', name: 'Personalized Link', price: 99, currency: 'INR' }
      ];
    },

    /**
     * Initiate real commercial checkout flow
     * @param {string} productId ('vip_pass' | 'personalized_link' | 'template:tpl_xxx')
     * @param {Object} options
     */
    async createCheckout(productId = 'vip_pass', options = {}) {
      // 1. Call server commerce checkout endpoint
      let res, data;
      try {
        res = await fetch('/api/commerce/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ productId, options })
        });
        data = await res.json();
      } catch (networkErr) {
        const msg = 'Network error contacting checkout server: ' + networkErr.message;
        if (window.WishToast) window.WishToast.show({ title: 'Checkout Error', message: msg, type: 'error' });
        return { success: false, error: msg };
      }

      // 2. Truthfully handle unconfigured gateway
      if (res.status === 503 || data.status === 'provider_not_configured' || data.error?.code === 'PAYMENT_PROVIDER_NOT_CONFIGURED') {
        const message = data.error?.message || 'Payment gateway (Razorpay) is not configured in server environment variables. Live checkout is currently unavailable.';
        if (window.WishToast) {
          window.WishToast.show({
            title: 'Gateway Not Configured',
            message: message,
            type: 'warning'
          });
        }
        return {
          success: false,
          status: 'provider_not_configured',
          message: message,
          product: data.product
        };
      }

      if (!data.success) {
        const errMsg = data.error?.message || 'Failed to initialize checkout';
        if (window.WishToast) window.WishToast.show({ title: 'Checkout Failed', message: errMsg, type: 'error' });
        return { success: false, error: errMsg };
      }

      // 3. Load Razorpay SDK and open checkout modal
      try {
        await loadRazorpaySdk();
      } catch (sdkErr) {
        alert('Could not load payment gateway client: ' + sdkErr.message);
        return { success: false, error: sdkErr.message };
      }

      return new Promise((resolve) => {
        const rzpOptions = {
          key: data.keyId,
          amount: data.amountPaise,
          currency: data.currency,
          name: 'WishMagic',
          description: data.productName || 'VIP Creator Pass',
          order_id: data.providerOrderId,
          theme: { color: '#7C3AED' },
          modal: {
            ondismiss: function() {
              if (window.WishToast) {
                window.WishToast.show({
                  title: 'Checkout Dismissed',
                  message: 'Payment window was closed. Your order remains pending.',
                  type: 'info'
                });
              }
              resolve({ success: false, status: 'cancelled' });
            }
          },
          handler: async function(paymentResponse) {
            // 4. Cryptographic Server-Side Payment Verification
            if (window.WishToast) {
              window.WishToast.show({
                title: 'Verifying Payment...',
                message: 'Authorizing transaction with payment gateway...',
                type: 'info'
              });
            }

            try {
              const verifyRes = await fetch('/api/commerce/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                  orderId: data.orderId,
                  razorpayOrderId: paymentResponse.razorpay_order_id,
                  razorpayPaymentId: paymentResponse.razorpay_payment_id,
                  razorpaySignature: paymentResponse.razorpay_signature
                })
              });
              const verifyData = await verifyRes.json();

              if (verifyData.success) {
                if (window.WishToast) {
                  window.WishToast.show({
                    title: 'Payment Verified! 👑',
                    message: 'VIP Pass activated! All premium blueprints are unlocked.',
                    type: 'success'
                  });
                }
                // Refresh client entitlement
                if (window.WishEntitlement && typeof window.WishEntitlement.refresh === 'function') {
                  window.WishEntitlement.refresh();
                }
                resolve({ success: true, verified: true, order: verifyData.order, entitlement: verifyData.entitlement });
              } else {
                const failMsg = verifyData.error?.message || 'Payment verification failed';
                if (window.WishToast) window.WishToast.show({ title: 'Verification Failed', message: failMsg, type: 'error' });
                resolve({ success: false, error: failMsg });
              }
            } catch (vErr) {
              resolve({ success: false, error: 'Verification network error: ' + vErr.message });
            }
          }
        };

        const rzp = new window.Razorpay(rzpOptions);
        rzp.open();
      });
    },

    /**
     * Get user order history from server
     */
    async getUserOrders() {
      try {
        const res = await fetch('/api/commerce/orders', { credentials: 'include' });
        return await res.json();
      } catch (e) {
        return { success: false, error: e.message, orders: [] };
      }
    }
  };

  window.WishPaymentService = WishPaymentService;

})(typeof window !== 'undefined' ? window : globalThis);
