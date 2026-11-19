(function (window2) {
  "use strict";

  const FEATURE_CATALOG = {
    custom_link: {
      key: "custom_link",
      name: "Custom Branded Link",
      description: "Choose a memorable personal URL like /w/happy-birthday-priya.",
      icon: "link",
      category: "links"
    },
    yearly_custom_link: {
      key: "yearly_custom_link",
      name: "1-Year Custom Link (365 Days)",
      description: "Keep your custom branded celebration link active for a full year (365 days).",
      icon: "calendar_month",
      category: "links"
    },
    hd_photos: {
      key: "hd_photos",
      name: "HD Photos Upload",
      description: "Upload crystal-clear HD photos on templates that support photo uploads.",
      icon: "photo_library",
      category: "media"
    },
    premium_templates: {
      key: "premium_templates",
      name: "Custom-Priced Templates",
      description: "Each template has its own Free or custom ₹ price set individually.",
      icon: "style",
      category: "templates"
    },
    unlimited_photos: {
      key: "unlimited_photos",
      name: "HD Photo Gallery",
      description: "Attach crystal-clear HD memories on photo-enabled templates.",
      icon: "photo_library",
      category: "media"
    },
    remove_watermark: {
      key: "remove_watermark",
      name: "Clean Branded Experience",
      description: "Deliver a crisp, personal celebration website with your own custom link.",
      icon: "branding_watermark",
      category: "branding"
    },
    keep_memory_forever: {
      key: "keep_memory_forever",
      name: "1-Year Memory Hosting",
      description: "Keep your custom celebration link live for 365 full days.",
      icon: "all_inclusive",
      category: "preservation"
    }
  };

  const PLANS = {
    free: {
      id: "free",
      name: "Free Random Link",
      badge: "FREE",
      tagline: "Instant free wish link on free templates",
      description: "Customize any free template and publish with an instant random link at ₹0.",
      price: 0,
      currency: "INR",
      currencySymbol: "₹",
      billingType: "free",
      isActive: true,
      features: ["beautiful_templates", "basic_customization", "recipient_sender_names", "personal_letter"],
      limits: {
        maxPhotos: 3,
        maxVoiceDurationSeconds: 0,
        allowMusicUpload: false,
        allowCustomSections: false,
        watermarkRequired: true,
        lifetimePreservation: false,
        allowedGalleryLayouts: ["grid"],
        allowedThemes: ["magical", "cute", "celebration", "pastel"]
      }
    },
    personalized_link: {
      id: "personalized_link",
      name: "Custom Link",
      badge: "CUSTOM LINK",
      tagline: "Memorable /w/your-name link",
      description: "Publish your wish with your own custom name link (/w/happy-birthday-name).",
      price: 19,
      originalPrice: 19,
      currency: "INR",
      currencySymbol: "₹",
      billingLabel: "per wish",
      billingType: "one_time",
      ctaText: "Get Custom Link • ₹19",
      isPopular: false,
      isActive: true,
      features: ["Custom branded URL (/w/your-name)", "Instant link availability check", "Direct WhatsApp & Instagram sharing"],
      perks: { customLink: true }
    },
    hd_photos: {
      id: "hd_photos",
      name: "HD Photos",
      badge: "PHOTO TEMPLATES ONLY",
      tagline: "Crisp high-definition photo uploads",
      description: "Available only on templates that support photo uploads. Auto-hidden on text-only templates.",
      price: 19,
      originalPrice: 19,
      currency: "INR",
      currencySymbol: "₹",
      billingLabel: "per wish",
      billingType: "one_time",
      ctaText: "Add HD Photos • ₹19",
      isPopular: false,
      isActive: true,
      features: ["High-definition lossless photo clarity", "Only shown on photo-enabled templates", "Automatically ₹0 / hidden on non-photo templates"],
      perks: { hdPhotos: true, maxPhotos: 16 }
    },
    custom_link_1yr: {
      id: "custom_link_1yr",
      name: "1-Year Custom Link",
      badge: "BEST VALUE • 1 YEAR",
      tagline: "Custom /w/your-name link active for 365 days",
      description: "Includes your custom branded link kept live and shareable for 1 full year (365 days).",
      price: 149,
      originalPrice: 149,
      currency: "INR",
      currencySymbol: "₹",
      billingLabel: "for 1 year",
      billingType: "one_time",
      ctaText: "Get 1-Year Custom Link • ₹149",
      isPopular: true,
      isActive: true,
      features: ["Custom branded URL (/w/your-name)", "Active for 1 full year (365 days)", "No extra ₹19 custom link fee"],
      perks: { customLink: true, yearlyLink: true, validityDays: 365 }
    },
    premium: {
      id: "premium",
      name: "1-Year Custom Link",
      badge: "1 YEAR",
      tagline: "Custom branded link active for 365 days",
      description: "Includes custom branded link active for 1 full year (365 days).",
      price: 149,
      currency: "INR",
      currencySymbol: "₹",
      billingType: "one_time",
      isActive: true,
      features: ["custom_link", "yearly_custom_link", "hd_photos", "unlimited_photos", "keep_memory_forever"],
      limits: {
        maxPhotos: 16,
        maxVoiceDurationSeconds: 120,
        allowMusicUpload: true,
        allowCustomSections: true,
        watermarkRequired: false,
        lifetimePreservation: true,
        allowedGalleryLayouts: ["grid", "polaroid", "carousel", "masonry"],
        allowedThemes: ["magical", "romantic", "cute", "elegant", "royal", "dark", "pastel", "celebration"]
      }
    }
  };

  const WishPlanService = {
    getPlan(planId = "free") {
      const id = String(planId || "free").toLowerCase();
      return PLANS[id] || PLANS.free;
    },
    getAllPlans() {
      return Object.values(PLANS);
    },
    getFeature(featureKey) {
      return FEATURE_CATALOG[featureKey] || null;
    },
    getAllFeatures() {
      return Object.values(FEATURE_CATALOG);
    },
    getPlanFeatures(planId = "free") {
      return (this.getPlan(planId).features || []).map((k) => FEATURE_CATALOG[k] || { key: k, name: k });
    },
    getPlanLimits(planId = "free") {
      const base = this.getPlan(planId).limits || PLANS.free.limits;
      return { ...base };
    },
    syncFromServerSettings(settings) {
      if (!settings || typeof settings !== "object") return;
      const a = settings.addons || {};
      const clPrice = Number.isFinite(Number(a.customLinkPrice ?? settings.personalized?.price))
        ? Number(a.customLinkPrice ?? settings.personalized?.price)
        : 19;
      const hdPrice = Number.isFinite(Number(a.hdPhotosPrice ?? a.hdImageStylePrice))
        ? Number(a.hdPhotosPrice ?? a.hdImageStylePrice)
        : 19;
      const yrPrice = Number.isFinite(Number(a.yearlyCustomLinkPrice))
        ? Number(a.yearlyCustomLinkPrice)
        : 149;

      if (PLANS.personalized_link) {
        PLANS.personalized_link.price = clPrice;
        PLANS.personalized_link.ctaText = `Get Custom Link • ₹${clPrice}`;
      }
      if (PLANS.hd_photos) {
        PLANS.hd_photos.price = hdPrice;
        PLANS.hd_photos.ctaText = `Add HD Photos • ₹${hdPrice}`;
      }
      if (PLANS.custom_link_1yr) {
        PLANS.custom_link_1yr.price = yrPrice;
        PLANS.custom_link_1yr.ctaText = `Get 1-Year Custom Link • ₹${yrPrice}`;
      }
      if (PLANS.premium) {
        PLANS.premium.price = yrPrice;
      }

      const plansList = Array.isArray(settings.vipPlans) ? settings.vipPlans : [];
      plansList.forEach((cp) => {
        if (!cp || !cp.id) return;
        PLANS[cp.id] = {
          ...(PLANS[cp.id] || {}),
          id: cp.id,
          name: cp.name,
          badge: cp.badge || "ADD-ON",
          description: cp.description || "",
          price: Number(cp.price ?? 0),
          originalPrice: Number(cp.originalPrice ?? cp.price ?? 0),
          billingLabel: cp.billingLabel || "per wish",
          ctaText: cp.ctaText || `Unlock ${cp.name} • ₹${cp.price}`,
          isPopular: Boolean(cp.isPopular),
          isActive: cp.isActive !== false,
          perks: cp.perks || {},
          features: Array.isArray(cp.features) ? cp.features : [],
          customBullets: Array.isArray(cp.features) ? cp.features : []
        };
      });
    }
  };

  window2.WishPlanService = WishPlanService;
  window2.WishPlans = PLANS;
  window2.WishFeatures = FEATURE_CATALOG;
})(typeof window !== "undefined" ? window : globalThis);
