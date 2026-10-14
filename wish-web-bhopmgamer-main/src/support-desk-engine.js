/**
 * WishMagic Production Customer Support & Help Center Engine (Part 34)
 * ====================================================================
 * End-user ticket creation, conversation threads, attachments,
 * knowledge base & FAQ search, admin desk operations, diagnostic hooks,
 * and user satisfaction ratings.
 *
 * Compatible with Cloudflare Workers (D1) and local Express dev runtime.
 */

import { createAuditLogEntry, isAuthoritativeAdmin } from './admin-operations-engine.js';
import { createInAppNotification } from './notification-engine.js';

// ============================================================================
// 1. ENUMS & CONSTANTS
// ============================================================================

export const TICKET_CATEGORIES = {
  ACCOUNT: {
    id: 'account',
    name: 'Account & Sign-in',
    icon: 'manage_accounts',
    description: 'Issues with Google sign-in, account settings, or session access'
  },
  BILLING: {
    id: 'billing',
    name: 'Payment, Orders & Refunds',
    icon: 'payments',
    description: 'UPI/Card checkout, payment confirmation, receipts, or refund queries'
  },
  PUBLISHING: {
    id: 'publishing',
    name: 'Wish Publishing & Sharing',
    icon: 'share',
    description: 'Celebration link generation, upcoming countdowns, or WhatsApp delivery'
  },
  MEDIA: {
    id: 'media',
    name: 'Photos, Music & Uploads',
    icon: 'perm_media',
    description: 'Photo upload failures, audio track playback, or background music'
  },
  TEMPLATES: {
    id: 'templates',
    name: 'Templates & Customization',
    icon: 'auto_fix_high',
    description: 'Relationship variants, greeting messages, and template animation issues'
  },
  TECHNICAL: {
    id: 'technical',
    name: 'Technical & Link Errors',
    icon: 'pest_control',
    description: 'Broken celebration links, 3D WebGL rendering problems, or browser crashes'
  },
  GENERAL: {
    id: 'general',
    name: 'General Inquiries',
    icon: 'help_center',
    description: 'General support questions, suggestions, or feature requests'
  }
};

export const TICKET_STATUS = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  WAITING_CUSTOMER: 'waiting_customer',
  RESOLVED: 'resolved',
  CLOSED: 'closed'
};

export const TICKET_PRIORITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent'
};

export const MESSAGE_SENDER_TYPE = {
  USER: 'user',
  ADMIN: 'admin',
  SYSTEM: 'system'
};

export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'text/plain',
  'application/json'
];

export const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export const VALIDATION_LIMITS = {
  SUBJECT_MIN: 5,
  SUBJECT_MAX: 200,
  DESCRIPTION_MIN: 10,
  DESCRIPTION_MAX: 5000,
  MESSAGE_MIN: 2,
  MESSAGE_MAX: 4000
};

// ============================================================================
// 2. DEFAULT KNOWLEDGE BASE & FAQ ARTICLES
// ============================================================================

export const DEFAULT_HELP_ARTICLES = [
  {
    id: 'art_create_wish',
    slug: 'how-to-create-a-celebration-wish',
    categoryId: 'templates',
    categoryName: 'Templates & Customization',
    title: 'How to Create and Personalize a Celebration Wish',
    excerpt: 'Step-by-step guide to selecting an occasion, picking a relationship variant, customizing photos, and previewing.',
    icon: 'auto_fix_high',
    sortOrder: 1,
    isPublished: 1,
    contentMarkdown: `### Creating Your Wish in WishMagic
1. **Explore the Marketplace**: Visit the Templates catalog and filter by occasion (Birthday, Anniversary, Valentine's, etc.).
2. **Choose Relationship Variant**: Each template includes custom tailoring (e.g., Best Friend, Romantic Partner, Sibling, Parents).
3. **Customize Photos & Message**: Upload up to 10 photos into interactive photo polaroids and write heartfelt notes.
4. **Choose Background Music**: Select from our curated background audio library or upload custom audio.
5. **Real-time 3D Preview**: Test interactive animations, particle confetti, and letter opening before publishing.`
  },
  {
    id: 'art_publishing_sharing',
    slug: 'how-to-publish-and-share-celebration-links',
    categoryId: 'publishing',
    categoryName: 'Wish Publishing & Sharing',
    title: 'Publishing and Sharing Your Unique Celebration Link',
    excerpt: 'How instant publishing works, unique URLs (/w/your-slug), and one-click WhatsApp sharing.',
    icon: 'share',
    sortOrder: 2,
    isPublished: 1,
    contentMarkdown: `### Publishing & Sharing
- Once you click **Publish**, WishMagic creates an immutable high-performance celebration snapshot.
- You receive a clean, vanity link: \`https://wishmagic.live/w/your-custom-slug\`.
- Click the **Share on WhatsApp** button to instantly share a preview card with your recipient.
- The link can be opened on any modern mobile or desktop browser without requiring the recipient to download an app or log in.`
  },
  {
    id: 'art_upcoming_countdown',
    slug: 'why-is-my-wish-showing-upcoming-countdown',
    categoryId: 'publishing',
    categoryName: 'Wish Publishing & Sharing',
    title: 'Why Does My Link Show an Upcoming Countdown Screen?',
    excerpt: 'Understanding scheduled celebration dates and midnight countdown unlocks.',
    icon: 'schedule',
    sortOrder: 3,
    isPublished: 1,
    contentMarkdown: `### Scheduled Event Dates & Timezones
- If your scheduled event date is in the future, recipients will see a beautiful anticipation countdown.
- At 12:00 AM on the scheduled event date (calculated in your chosen timezone, default Indian Standard Time), the celebration unlocks automatically with cake cutting and confetti.
- **Creator Preview**: As the creator logged into your account, you can always preview the full unlocked celebration at any time.`
  },
  {
    id: 'art_expiry_preservation',
    slug: 'understanding-wish-expiry-and-vip-preservation',
    categoryId: 'technical',
    categoryName: 'Wish Expiry & Preservation',
    title: 'Understanding Link Expiry and VIP Lifetime Preservation',
    excerpt: 'How the 7-day retention window works for Free links and how VIP passes preserve memories permanently.',
    icon: 'hourglass_bottom',
    sortOrder: 4,
    isPublished: 1,
    contentMarkdown: `### Free vs VIP Retention Policy
- **Free Tier Links**: Remain live and interactive for **7 days** following the celebration event date. After 7 days, links expire to ensure high-performance storage hygiene.
- **VIP Lifetime Access**: VIP templates and VIP-upgraded wishes include **permanent cloud preservation**, higher resolution photo storage, and ad-free experience.
- **Accidental Expiry**: If your link expired recently, reach out via the Contact Support desk with your wish slug and our team can extend your link window.`
  },
  {
    id: 'art_payments_refunds',
    slug: 'payment-confirmation-upi-and-refund-policy',
    categoryId: 'billing',
    categoryName: 'Payment, Orders & Refunds',
    title: 'Payments, UPI Confirmation, and Orders',
    excerpt: 'Instant Razorpay checkout, UPI/Cards, invoice downloads, and what to do if payment is pending.',
    icon: 'payments',
    sortOrder: 5,
    isPublished: 1,
    contentMarkdown: `### Payment Verification & Billing
- **Payment Methods**: We support UPI (Google Pay, PhonePe, Paytm, BHIM), Credit/Debit Cards, and Net Banking powered by Razorpay.
- **Instant Activation**: VIP template passes are unlocked immediately upon payment capture.
- **Pending Payments**: If money was debited from your bank but your order shows pending, our automated webhook reconciliation catches it within 2-5 minutes.
- **Need Help?**: You can file a support ticket directly from your **Account > Orders & Purchases** section.`
  },
  {
    id: 'art_photo_upload_guidelines',
    slug: 'photo-uploads-formats-and-resolution-guide',
    categoryId: 'media',
    categoryName: 'Photos, Music & Uploads',
    title: 'Photo Uploads: Supported Formats and Best Quality',
    excerpt: 'Recommended image formats (JPG, PNG, WebP), upload limits, and auto-compression.',
    icon: 'image',
    sortOrder: 6,
    isPublished: 1,
    contentMarkdown: `### Image Upload Tips
- **Supported Formats**: JPG, PNG, and WebP images up to 10MB each.
- **Storage**: Photos are securely hosted on high-speed CDNs with automatic client-side compression.
- **Aspect Ratio**: We recommend vertical (3:4 or 9:16) photos for polaroid cards and mobile celebration viewers.
- **Privacy Guarantee**: User photos are private to your celebration link and never used in public template galleries without explicit consent.`
  },
  {
    id: 'art_audio_music_issues',
    slug: 'audio-music-playback-and-autoplay-policy',
    categoryId: 'media',
    categoryName: 'Photos, Music & Uploads',
    title: 'Music Playback & Mobile Browser Autoplay Restrictions',
    excerpt: 'Why music requires a first tap on iOS/Android due to browser autoplay policies.',
    icon: 'volume_up',
    sortOrder: 7,
    isPublished: 1,
    contentMarkdown: `### Mobile Audio & Browser Policies
- **Autoplay Restriction**: Modern browsers (Safari iOS, Chrome Android) block sound from playing until the user taps the screen.
- **Interactive Start Button**: Every WishMagic celebration features a glowing "Tap to Open" or "Start Celebration" button which initiates audio cleanly.
- **Mute / Volume Toggle**: Recipients can pause or adjust volume via the floating sound badge in the corner.`
  },
  {
    id: 'art_account_security',
    slug: 'account-security-and-creator-privacy',
    categoryId: 'account',
    categoryName: 'Account & Sign-in',
    title: 'Account Security, Google Sign-in & Privacy',
    excerpt: 'How user accounts are secured and how session tokens protect your creations.',
    icon: 'lock',
    sortOrder: 8,
    isPublished: 1,
    contentMarkdown: `### Safe and Simple Authentication
- WishMagic uses **Google Firebase Authentication** with server-side Cloudflare session cookies.
- We never store passwords or plain credentials.
- Your created celebration links can only be edited or deleted by your authenticated Google account.`
  }
];

// ============================================================================
// 3. HELP CENTER & KNOWLEDGE BASE ACCESSORS
// ============================================================================

export function getHelpCategories() {
  return Object.values(TICKET_CATEGORIES).map(cat => ({
    ...cat,
    articleCount: DEFAULT_HELP_ARTICLES.filter(a => a.categoryId === cat.id).length
  }));
}

export function listHelpArticles({ category = null, query = '', limit = 20, offset = 0 } = {}) {
  let list = [...DEFAULT_HELP_ARTICLES].filter(a => a.isPublished === 1);

  if (category) {
    const catLower = category.toLowerCase();
    list = list.filter(a => a.categoryId.toLowerCase() === catLower);
  }

  if (query && query.trim()) {
    const q = query.trim().toLowerCase();
    list = list.filter(a =>
      a.title.toLowerCase().includes(q) ||
      a.excerpt.toLowerCase().includes(q) ||
      a.categoryName.toLowerCase().includes(q) ||
      a.contentMarkdown.toLowerCase().includes(q)
    );
  }

  list.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

  const total = list.length;
  const paginated = list.slice(offset, offset + limit);

  return {
    total,
    articles: paginated
  };
}

export function getHelpArticleBySlug(slug) {
  if (!slug) return null;
  const clean = slug.trim().toLowerCase();
  return DEFAULT_HELP_ARTICLES.find(a => a.slug.toLowerCase() === clean) || null;
}

// ============================================================================
// 4. TICKET CREATION & VALIDATION
// ============================================================================

export function generateTicketNumber() {
  const d = new Date();
  const yearMonth = `${d.getFullYear().toString().slice(-2)}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const randomPart = Math.floor(1000 + Math.random() * 9000).toString();
  return `TKT-${yearMonth}-${randomPart}`;
}

export function validateTicketInput({ category, subject, description, orderId, wishId, attachments, user }) {
  const errors = {};

  if (!subject || typeof subject !== 'string' || subject.trim().length < VALIDATION_LIMITS.SUBJECT_MIN) {
    errors.subject = `Subject must be at least ${VALIDATION_LIMITS.SUBJECT_MIN} characters.`;
  } else if (subject.trim().length > VALIDATION_LIMITS.SUBJECT_MAX) {
    errors.subject = `Subject cannot exceed ${VALIDATION_LIMITS.SUBJECT_MAX} characters.`;
  }

  if (!description || typeof description !== 'string' || description.trim().length < VALIDATION_LIMITS.DESCRIPTION_MIN) {
    errors.description = `Description must be at least ${VALIDATION_LIMITS.DESCRIPTION_MIN} characters.`;
  } else if (description.trim().length > VALIDATION_LIMITS.DESCRIPTION_MAX) {
    errors.description = `Description cannot exceed ${VALIDATION_LIMITS.DESCRIPTION_MAX} characters.`;
  }

  const validCatIds = Object.values(TICKET_CATEGORIES).map(c => c.id);
  if (category && !validCatIds.includes(category.toLowerCase())) {
    errors.category = `Invalid issue category. Allowed: ${validCatIds.join(', ')}`;
  }

  if (Array.isArray(attachments)) {
    for (let i = 0; i < attachments.length; i++) {
      const att = attachments[i];
      if (att.fileSize && att.fileSize > MAX_ATTACHMENT_SIZE_BYTES) {
        errors.attachments = `Attachment "${att.fileName || i + 1}" exceeds max limit of 5 MB.`;
        break;
      }
      if (att.mimeType && !ALLOWED_ATTACHMENT_MIME_TYPES.includes(att.mimeType.toLowerCase())) {
        errors.attachments = `Attachment format "${att.mimeType}" is not supported. Use JPG, PNG, WebP, or TXT.`;
        break;
      }
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
}

export function createSupportTicketRecord({
  userId = null,
  userEmail = 'guest@wishmagic.live',
  userName = 'Customer',
  category = 'general',
  subject,
  description,
  orderId = null,
  wishId = null,
  attachments = [],
  contactPreference = 'in_app',
  priority = TICKET_PRIORITY.MEDIUM,
  actor = null
}) {
  const validation = validateTicketInput({ category, subject, description, orderId, wishId, attachments });
  if (!validation.valid) {
    const firstErr = Object.values(validation.errors)[0];
    throw new Error(firstErr || 'Invalid ticket data');
  }

  const ticketNumber = generateTicketNumber();
  const ticketId = `tkt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();

  const ticket = {
    id: ticketId,
    ticketNumber,
    ticket_number: ticketNumber,
    userId,
    user_id: userId,
    userEmail: userEmail.trim().toLowerCase(),
    user_email: userEmail.trim().toLowerCase(),
    userName: userName.trim(),
    user_name: userName.trim(),
    wishId: wishId || null,
    wish_id: wishId || null,
    orderId: orderId || null,
    order_id: orderId || null,
    category: category.toLowerCase(),
    subject: subject.trim(),
    description: description.trim(),
    status: TICKET_STATUS.OPEN,
    priority: priority.toLowerCase(),
    adminNotes: null,
    admin_notes: null,
    assignedTo: null,
    assigned_to: null,
    diagnosticData: '{}',
    diagnostic_data: '{}',
    resolutionSummary: null,
    resolution_summary: null,
    lastCustomerMessageAt: now,
    last_customer_message_at: now,
    lastAgentResponseAt: null,
    last_agent_response_at: null,
    resolvedAt: null,
    resolved_at: null,
    closedAt: null,
    closed_at: null,
    reopenCount: 0,
    reopen_count: 0,
    satisfactionRating: null,
    satisfaction_rating: null,
    satisfactionFeedback: null,
    satisfaction_feedback: null,
    contactPreference,
    contact_preference: contactPreference,
    createdAt: now,
    created_at: now,
    updatedAt: now,
    updated_at: now
  };

  // Initial message representing ticket description
  const initialMessage = {
    id: `tmsg_${Date.now().toString(36)}_init`,
    ticketId,
    ticket_id: ticketId,
    senderType: MESSAGE_SENDER_TYPE.USER,
    sender_type: MESSAGE_SENDER_TYPE.USER,
    senderId: userId || 'guest',
    sender_id: userId || 'guest',
    senderName: userName || 'Customer',
    sender_name: userName || 'Customer',
    message: description.trim(),
    isInternalNote: 0,
    is_internal_note: 0,
    attachmentsJson: JSON.stringify(attachments || []),
    attachments_json: JSON.stringify(attachments || []),
    createdAt: now,
    created_at: now
  };

  const auditLog = createAuditLogEntry({
    actorId: actor?.id || userId || 'system',
    actorName: actor?.displayName || userName || 'Customer',
    actorRole: actor?.role || 'customer',
    action: 'SUPPORT_TICKET_CREATED',
    targetType: 'support_ticket',
    targetId: ticket.id,
    details: {
      ticketNumber,
      category: ticket.category,
      subject: ticket.subject,
      wishId: ticket.wishId,
      orderId: ticket.orderId
    }
  });

  return {
    ticket,
    initialMessage,
    auditLog
  };
}

// ============================================================================
// 5. CONVERSATION THREAD & MESSAGE OPERATIONS
// ============================================================================

export function addTicketMessage({
  ticket,
  senderType = MESSAGE_SENDER_TYPE.USER,
  senderId,
  senderName = 'User',
  message,
  isInternalNote = false,
  attachments = [],
  actor
}) {
  if (!ticket) throw new Error('Ticket is required');
  if (!message || typeof message !== 'string' || message.trim().length < VALIDATION_LIMITS.MESSAGE_MIN) {
    throw new Error(`Message must be at least ${VALIDATION_LIMITS.MESSAGE_MIN} characters.`);
  }

  // Security Invariant: Regular customers can NEVER post internal notes
  const isAgent = isAuthoritativeAdmin(actor);
  const effectiveInternalNote = isAgent ? Boolean(isInternalNote) : false;

  const now = new Date().toISOString();
  const messageId = `tmsg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  const messageRecord = {
    id: messageId,
    ticketId: ticket.id,
    ticket_id: ticket.id,
    senderType: isAgent ? MESSAGE_SENDER_TYPE.ADMIN : MESSAGE_SENDER_TYPE.USER,
    sender_type: isAgent ? MESSAGE_SENDER_TYPE.ADMIN : MESSAGE_SENDER_TYPE.USER,
    senderId: senderId || actor?.id || 'unknown',
    sender_id: senderId || actor?.id || 'unknown',
    senderName: senderName || (isAgent ? 'Support Team' : 'Customer'),
    sender_name: senderName || (isAgent ? 'Support Team' : 'Customer'),
    message: message.trim(),
    isInternalNote: effectiveInternalNote ? 1 : 0,
    is_internal_note: effectiveInternalNote ? 1 : 0,
    attachmentsJson: JSON.stringify(attachments || []),
    attachments_json: JSON.stringify(attachments || []),
    createdAt: now,
    created_at: now
  };

  // State Transition & Timestamps
  ticket.updatedAt = now;
  ticket.updated_at = now;

  if (isAgent) {
    if (!effectiveInternalNote) {
      ticket.lastAgentResponseAt = now;
      ticket.last_agent_response_at = now;
      if (ticket.status === TICKET_STATUS.OPEN) {
        ticket.status = TICKET_STATUS.IN_PROGRESS;
      }
    }
  } else {
    // User replied
    ticket.lastCustomerMessageAt = now;
    ticket.last_customer_message_at = now;

    // If ticket was resolved or closed, user response automatically reopens it!
    if (ticket.status === TICKET_STATUS.RESOLVED || ticket.status === TICKET_STATUS.CLOSED) {
      ticket.status = TICKET_STATUS.IN_PROGRESS;
      ticket.reopenCount = (Number(ticket.reopenCount || ticket.reopen_count) || 0) + 1;
      ticket.reopen_count = ticket.reopenCount;
    }
  }

  const auditLog = createAuditLogEntry({
    actorId: actor?.id || senderId || 'system',
    actorName: senderName,
    actorRole: isAgent ? 'admin' : 'customer',
    action: effectiveInternalNote ? 'SUPPORT_NOTE_ADDED' : 'SUPPORT_MESSAGE_POSTED',
    targetType: 'support_ticket',
    targetId: ticket.id,
    details: {
      ticketNumber: ticket.ticketNumber || ticket.ticket_number,
      senderType: messageRecord.senderType,
      isInternalNote: effectiveInternalNote
    }
  });

  return {
    ticket,
    message: messageRecord,
    auditLog
  };
}

// ============================================================================
// 6. STATUS TRANSITIONS & RESOLUTIONS
// ============================================================================

export function updateTicketStatus({
  ticket,
  status,
  priority = null,
  assignedTo = null,
  resolutionSummary = null,
  adminNotes = null,
  actor
}) {
  if (!ticket) throw new Error('Ticket not found');

  const validStatuses = Object.values(TICKET_STATUS);
  if (status && !validStatuses.includes(status)) {
    throw new Error(`Invalid status: ${status}. Allowed: ${validStatuses.join(', ')}`);
  }

  const now = new Date().toISOString();
  const prevStatus = ticket.status;

  if (status) {
    ticket.status = status;
    if (status === TICKET_STATUS.RESOLVED) {
      ticket.resolvedAt = now;
      ticket.resolved_at = now;
      if (resolutionSummary) {
        ticket.resolutionSummary = resolutionSummary;
        ticket.resolution_summary = resolutionSummary;
      }
    } else if (status === TICKET_STATUS.CLOSED) {
      ticket.closedAt = now;
      ticket.closed_at = now;
    }
  }

  if (priority) {
    const validPriorities = Object.values(TICKET_PRIORITY);
    if (validPriorities.includes(priority.toLowerCase())) {
      ticket.priority = priority.toLowerCase();
    }
  }

  if (assignedTo !== undefined) {
    ticket.assignedTo = assignedTo;
    ticket.assigned_to = assignedTo;
  }

  if (adminNotes !== null && adminNotes !== undefined) {
    ticket.adminNotes = adminNotes;
    ticket.admin_notes = adminNotes;
  }

  ticket.updatedAt = now;
  ticket.updated_at = now;

  const auditLog = createAuditLogEntry({
    actorId: actor?.id || 'admin',
    actorName: actor?.displayName || 'Administrator',
    actorRole: actor?.role || 'admin',
    action: 'SUPPORT_TICKET_STATUS_UPDATED',
    targetType: 'support_ticket',
    targetId: ticket.id,
    details: {
      ticketNumber: ticket.ticketNumber || ticket.ticket_number,
      previousStatus: prevStatus,
      newStatus: ticket.status,
      priority: ticket.priority,
      resolutionSummary
    }
  });

  return { ticket, auditLog };
}

export function rateTicketSatisfaction({ ticket, userId, rating, feedback = '' }) {
  if (!ticket) throw new Error('Ticket not found');
  if (ticket.userId && userId && ticket.userId !== userId) {
    throw new Error('Forbidden: You can only rate your own support tickets');
  }

  const numRating = Number(rating);
  if (!Number.isInteger(numRating) || numRating < 1 || numRating > 5) {
    throw new Error('Rating must be an integer between 1 and 5 stars');
  }

  const now = new Date().toISOString();
  ticket.satisfactionRating = numRating;
  ticket.satisfaction_rating = numRating;
  ticket.satisfactionFeedback = feedback ? String(feedback).trim().slice(0, 1000) : null;
  ticket.satisfaction_feedback = ticket.satisfactionFeedback;
  ticket.updatedAt = now;
  ticket.updated_at = now;

  return { ticket };
}

// ============================================================================
// 7. SECURITY & ACCESS CONTROL (IDOR PROTECTION)
// ============================================================================

/**
 * Strips internal notes and unneeded admin data from customer responses.
 * Guarantees customers NEVER see internal notes or private agent info.
 */
export function sanitizeTicketForUser(ticket, messages = [], requestingUser = null) {
  if (!ticket) return null;
  const isAdmin = isAuthoritativeAdmin(requestingUser);

  // If regular user, ensure messages do NOT include internal notes
  const safeMessages = messages
    .filter(m => isAdmin || !(m.isInternalNote === 1 || m.is_internal_note === 1))
    .map(m => {
      let atts = [];
      try {
        atts = typeof m.attachmentsJson === 'string'
          ? JSON.parse(m.attachmentsJson)
          : (m.attachments_json ? JSON.parse(m.attachments_json) : (m.attachments || []));
      } catch (e) {}

      return {
        id: m.id,
        ticketId: m.ticketId || m.ticket_id,
        senderType: m.senderType || m.sender_type,
        senderName: m.senderName || m.sender_name || 'Support Agent',
        message: m.message,
        isInternalNote: isAdmin ? (m.isInternalNote === 1 || m.is_internal_note === 1) : false,
        attachments: atts,
        createdAt: m.createdAt || m.created_at
      };
    });

  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber || ticket.ticket_number,
    category: ticket.category,
    subject: ticket.subject,
    description: ticket.description,
    status: ticket.status,
    priority: ticket.priority,
    wishId: ticket.wishId || ticket.wish_id,
    orderId: ticket.orderId || ticket.order_id,
    userEmail: ticket.userEmail || ticket.user_email,
    userName: ticket.userName || ticket.user_name,
    assignedTo: isAdmin ? (ticket.assignedTo || ticket.assigned_to) : null,
    adminNotes: isAdmin ? (ticket.adminNotes || ticket.admin_notes) : null,
    resolutionSummary: ticket.resolutionSummary || ticket.resolution_summary,
    reopenCount: ticket.reopenCount || ticket.reopen_count || 0,
    satisfactionRating: ticket.satisfactionRating || ticket.satisfaction_rating,
    satisfactionFeedback: ticket.satisfactionFeedback || ticket.satisfaction_feedback,
    createdAt: ticket.createdAt || ticket.created_at,
    updatedAt: ticket.updatedAt || ticket.updated_at,
    resolvedAt: ticket.resolvedAt || ticket.resolved_at,
    closedAt: ticket.closedAt || ticket.closed_at,
    messages: safeMessages
  };
}
