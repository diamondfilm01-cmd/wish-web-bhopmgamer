(function (window2) {
  "use strict";

  const PREMIUM_THEMES = ["romantic", "elegant", "royal", "dark"];
  const FREE_THEMES = ["magical", "cute", "celebration", "pastel"];
  const PREMIUM_SECTIONS = ["countdown", "timeline", "voice", "secret_message", "open_when", "final_surprise"];
  const FREE_SECTIONS = ["hero", "message", "gallery", "memories", "finale"];
  const PREMIUM_GALLERY_LAYOUTS = ["polaroid", "carousel", "masonry"];
  const FREE_GALLERY_LAYOUTS = ["grid"];

  function getLivePricing() {
    if (window2.WishPricingEngine && typeof window2.WishPricingEngine.getRules === "function") {
      const r = window2.WishPricingEngine.getRules();
      return {
        customLinkPrice: Number(r.customLinkPrice ?? 19),
        hdPhotosPrice: Number(r.hdPhotosPrice ?? r.hdImageStylePrice ?? 19),
        yearlyCustomLinkPrice: Number(r.yearlyCustomLinkPrice ?? 149)
      };
    }
    const addons = window2._cachedWishLinkSettings?.addons || {};
    return {
      customLinkPrice: Number(addons.customLinkPrice ?? window2._cachedWishLinkSettings?.personalized?.price ?? 19),
      hdPhotosPrice: Number(addons.hdPhotosPrice ?? addons.hdImageStylePrice ?? 19),
      yearlyCustomLinkPrice: Number(addons.yearlyCustomLinkPrice ?? 149)
    };
  }

  function isUserPremium() {
    return Boolean(window2.WishEntitlement && window2.WishEntitlement.isPremium());
  }

  function hasTemplateEntitlement(templateId) {
    if (isUserPremium()) return true;
    return Boolean(
      templateId &&
        window2.WishEntitlement &&
        typeof window2.WishEntitlement.hasTemplateEntitlement === "function" &&
        window2.WishEntitlement.hasTemplateEntitlement(templateId)
    );
  }

  function hasHdPhotosEntitlement(templateId) {
    if (isUserPremium()) return true;
    return Boolean(
      window2.WishEntitlement &&
        typeof window2.WishEntitlement.hasHdPhotosAccess === "function" &&
        window2.WishEntitlement.hasHdPhotosAccess(templateId)
    );
  }

  const WishFeatureAccess = {
    canUseTemplate(template) {
      if (!template) return { allowed: true };
      const templateId = typeof template === "object" ? template.id : String(template);
      const isPaid = typeof template === "object" ? Number(template.price || 0) > 0 : false;
      if (!isPaid) return { allowed: true, plan: "free" };
      return hasTemplateEntitlement(templateId)
        ? { allowed: true, plan: "premium" }
        : {
            allowed: false,
            feature: "premium_templates",
            templateId,
            title: "Paid Template",
            reason: `This template is priced at ₹${Number(template.price)}. Unlock it to publish your wish.`,
            requiredPlan: "premium"
          };
    },

    canUseTheme(themeId, templateId = null) {
      const cleanTheme = String(themeId || "magical").toLowerCase();
      if (FREE_THEMES.includes(cleanTheme)) return { allowed: true, plan: "free" };
      return hasHdPhotosEntitlement(templateId) || hasTemplateEntitlement(templateId)
        ? { allowed: true, plan: "premium" }
        : {
            allowed: false,
            feature: "advanced_themes",
            title: "Premium Theme",
            reason: "Unlock HD Photos & Styles add-on to use this visual theme.",
            requiredPlan: "premium"
          };
    },

    canUseSection(sectionId, templateId = null) {
      const cleanId = String(sectionId || "").toLowerCase();
      if (FREE_SECTIONS.includes(cleanId)) return { allowed: true, plan: "free" };
      return hasTemplateEntitlement(templateId) || hasHdPhotosEntitlement(templateId)
        ? { allowed: true, plan: "premium" }
        : {
            allowed: false,
            feature: "advanced_sections",
            title: "Interactive Section",
            reason: "Unlock this template or add-on to enable this interactive story section.",
            requiredPlan: "premium"
          };
    },

    canUseGalleryLayout(layout, templateId = null) {
      const cleanLayout = String(layout || "grid").toLowerCase();
      if (FREE_GALLERY_LAYOUTS.includes(cleanLayout)) return { allowed: true, plan: "free" };
      return hasHdPhotosEntitlement(templateId) || hasTemplateEntitlement(templateId)
        ? { allowed: true, plan: "premium" }
        : {
            allowed: false,
            feature: "unlimited_photos",
            title: "HD Gallery Style",
            reason: "Add HD Photos to unlock premium gallery layouts.",
            requiredPlan: "premium"
          };
    },

    canAddPhoto(currentCount = 0, templateId = null) {
      const isPrem = hasHdPhotosEntitlement(templateId) || hasTemplateEntitlement(templateId);
      const maxAllowed = isPrem ? 16 : 6;
      const pricing = getLivePricing();
      return currentCount < maxAllowed
        ? { allowed: true, current: currentCount, max: maxAllowed, remaining: maxAllowed - currentCount }
        : {
            allowed: false,
            current: currentCount,
            max: maxAllowed,
            remaining: 0,
            feature: "hd_photos",
            title: "HD Photos Upgrade",
            reason: isPrem
              ? "Maximum 16 HD photos allowed for this wish."
              : `Add HD Photos (₹${pricing.hdPhotosPrice}) to upload up to 16 crystal-clear HD photos.`,
            requiredPlan: "premium"
          };
    },

    canUseMusic(type = "curated", templateId = null) {
      if (type !== "upload") return { allowed: true, plan: "free" };
      return hasTemplateEntitlement(templateId) || hasHdPhotosEntitlement(templateId)
        ? { allowed: true, plan: "premium" }
        : {
            allowed: false,
            feature: "premium_music",
            title: "Custom Audio Upload",
            reason: "Custom MP3 audio upload is included with paid unlocks.",
            requiredPlan: "premium"
          };
    },

    canUploadVoiceNote(templateId = null) {
      return hasTemplateEntitlement(templateId) || hasHdPhotosEntitlement(templateId)
        ? { allowed: true, maxDurationSeconds: 120 }
        : {
            allowed: false,
            feature: "voice_note",
            title: "Voice Note",
            reason: "Add a personal voice dedication with your paid unlock.",
            requiredPlan: "premium"
          };
    },

    canRemoveWatermark(user, wish) {
      const tplId = wish && (wish.templateId || wish.template_id);
      return Boolean(
        hasTemplateEntitlement(tplId) ||
          hasHdPhotosEntitlement(tplId) ||
          (wish && wish.payment && (wish.payment.status === "Completed" || wish.payment.status === "PAID"))
      );
    },

    shouldShowWatermark(wish, user) {
      return !(
        (wish && wish.customData && wish.customData.watermarkRemoved && this.canRemoveWatermark(user, wish)) ||
        (wish && wish.payment && (wish.payment.status === "Completed" || wish.payment.status === "PAID")) ||
        isUserPremium()
      );
    },

    canKeepMemoryForever(user, wish) {
      const tplId = wish && (wish.templateId || wish.template_id);
      return Boolean(
        (window2.WishEntitlement && window2.WishEntitlement.hasYearlyLinkAccess(null, tplId)) ||
          (wish && wish.linkDuration === "1_year") ||
          isUserPremium()
      );
    },

    canPublishWish(template, customData = {}) {
      const templateId = template ? template.id : null;
      const isTplPaid = Boolean(template && Number(template.price || 0) > 0);
      const tplMissing = isTplPaid && !hasTemplateEntitlement(templateId);
      if (!tplMissing) {
        return { allowed: true, requiredTier: isTplPaid ? "vip" : "free", requiresUpgrade: false };
      }
      return {
        allowed: false,
        requiredTier: "vip",
        requiresUpgrade: true,
        reasons: [`Template Unlock (₹${Number(template.price)})`]
      };
    },

    explainLock(contextType, contextKey, template) {
      const pricing = getLivePricing();
      const tplPrice = template && Number(template.price) > 0 ? Number(template.price) : 0;

      switch (contextType) {
        case "template":
          return {
            title: "Unlock This Template",
            badge: "TEMPLATE UNLOCK",
            priceLabel: `₹${tplPrice} ONE-TIME`,
            subtitle: "Unlock this custom-priced template to publish and share your wish.",
            bullets: [
              "Full customization of every field in this template",
              "Combine with Custom Link (₹" + pricing.customLinkPrice + ") or 1-Year Link (₹" + pricing.yearlyCustomLinkPrice + ") anytime",
              "Instant shareable link ready for WhatsApp & Instagram"
            ],
            cta: `Unlock Template • ₹${tplPrice}`
          };
        case "hd_photos":
        case "media_limit":
        case "theme":
        case "section":
        case "watermark":
          return {
            title: "Add HD Photos",
            badge: "HD PHOTOS",
            priceLabel: `₹${pricing.hdPhotosPrice} PER WISH`,
            subtitle: "Upload crystal-clear high-definition photos on photo-enabled templates.",
            bullets: [
              "Sharp high-definition image quality without heavy compression",
              "Only available on templates that include photo upload slots",
              "Instant unlock saved securely to your account"
            ],
            cta: `Add HD Photos • ₹${pricing.hdPhotosPrice}`
          };
        case "yearly_link":
        case "preservation":
          return {
            title: "1-Year Custom Link",
            badge: "365 DAYS VALIDITY",
            priceLabel: `₹${pricing.yearlyCustomLinkPrice} FOR 1 YEAR`,
            subtitle: "Keep your custom branded /w/your-name celebration link active for 1 full year (365 days).",
            bullets: [
              "Custom branded URL (/w/your-name) included",
              "Live for 365 days — ideal for anniversaries & birthdays",
              "No extra ₹" + pricing.customLinkPrice + " custom link fee required"
            ],
            cta: `Get 1-Year Custom Link • ₹${pricing.yearlyCustomLinkPrice}`
          };
        default:
          return {
            title: "Custom Branded Link",
            badge: "CUSTOM LINK",
            priceLabel: `₹${pricing.customLinkPrice} PER WISH`,
            subtitle: "Create a memorable celebration link with their name (/w/your-name).",
            bullets: [
              "Personal /w/your-name shareable link",
              `Upgrade anytime to 1-Year Custom Link (₹${pricing.yearlyCustomLinkPrice})`,
              `Add HD Photos (₹${pricing.hdPhotosPrice}) on photo-enabled templates`
            ],
            cta: `Get Custom Link • ₹${pricing.customLinkPrice}`
          };
      }
    }
  };

  window2.WishFeatureAccess = WishFeatureAccess;
})(typeof window !== "undefined" ? window : globalThis);
