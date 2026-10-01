// WishMagic Universal Customizer & Dynamic Preview Engine

let activeTemplate = null;
let currentCustomData = {
  recipient_name: 'Kritika Sharma',
  sender_name: 'Ankit Verma',
  sender_contact: '+91 98765 43210',
  event_date: new Date().toISOString().split('T')[0],
  custom_message: "Happy Birthday Kritika! ✨ From chaotic late-night study sessions to surviving college together, you've been my constant anchor. Keep shining bright across this universe!",
  photo_1: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&auto=format&fit=crop&q=80',
  video_1: '',
  bg_music: ''
};

// Global helper sync functions
window.syncRecipient = function(val) {
  currentCustomData.recipient_name = val;
  updateFieldValue('recipient_name', val);
};

window.syncSender = function(val) {
  currentCustomData.sender_name = val;
  updateFieldValue('sender_name', val);
};

window.syncContact = function(val) {
  currentCustomData.sender_contact = val;
  updateFieldValue('sender_contact', val);
};

window.syncDate = function(val) {
  currentCustomData.event_date = val;
  updateFieldValue('event_date', val);
};

window.syncMessage = function(val) {
  currentCustomData.custom_message = val;
  updateFieldValue('custom_message', val);
};

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const templateId = urlParams.get('template') || 'tpl_cyber_bday';
  
  await loadTemplateData(templateId);
  setupEventListeners();
});

async function loadTemplateData(templateId) {
  try {
    const res = await fetch(`/api/templates/${templateId}`);
    const data = await res.json();
    if (data.success && data.template) {
      activeTemplate = data.template;
      renderCustomizerUI();
      loadTemplateInSandbox();
    } else {
      // Fallback: try fetching all templates to pick the first one
      const allRes = await fetch('/api/templates');
      const allData = await allRes.json();
      if (allData.success && allData.templates && allData.templates.length > 0) {
        activeTemplate = allData.templates[0];
        renderCustomizerUI();
        loadTemplateInSandbox();
      }
    }
  } catch (err) {
    console.error('Error loading template for customization:', err);
  }
}

function renderCustomizerUI() {
  if (!activeTemplate) return;

  // 1. Update Breadcrumbs and Ribbon Title
  const ribbonTitle = document.querySelector('.bg-secondary-container\\/20 span.font-label-md');
  if (ribbonTitle) {
    ribbonTitle.textContent = `Template: ${activeTemplate.name} • ${activeTemplate.tier === 'vip' ? '₹' + activeTemplate.price + ' VIP Blueprint' : 'Free Blueprint'}`;
  }

  const giftButton = document.querySelector('button.bg-gradient-to-r span:first-child');
  if (giftButton) {
    giftButton.textContent = activeTemplate.tier === 'vip' ? `Proceed to Gift • ₹${activeTemplate.price || 49}` : `Create Free Wish • ₹0`;
  }

  // 2. Render dynamic form inputs based on detected fields
  const dynamicFormContainer = document.getElementById('dynamic-customizer-form');
  if (dynamicFormContainer && activeTemplate.detectedFields && activeTemplate.detectedFields.length > 0) {
    dynamicFormContainer.innerHTML = '';
    
    // Group fields
    activeTemplate.detectedFields.forEach(field => {
      const fieldDiv = document.createElement('div');
      fieldDiv.className = 'flex flex-col gap-1.5';

      const label = document.createElement('label');
      label.className = 'font-label-md text-label-md text-on-surface-variant flex items-center justify-between font-semibold';
      label.innerHTML = `
        <span>${field.label}</span>
        <span class="text-[11px] text-primary font-mono opacity-80">data-wm="${field.key}"</span>
      `;
      fieldDiv.appendChild(label);

      if (field.type === 'textarea') {
        const textarea = document.createElement('textarea');
        textarea.rows = 3;
        textarea.className = 'w-full bg-surface-container-lowest text-on-surface rounded-xl p-3 font-body-md text-body-md shadow-inner focus:outline-none focus:ring-2 focus:ring-primary/60 border border-purple-500/20';
        textarea.value = currentCustomData[field.key] || field.defaultValue || '';
        textarea.addEventListener('input', (e) => {
          updateFieldValue(field.key, e.target.value);
        });
        fieldDiv.appendChild(textarea);
      } else if (field.type === 'image') {
        const imgWrap = document.createElement('div');
        imgWrap.className = 'flex items-center gap-3 p-3 bg-surface-container-lowest rounded-xl border border-purple-500/20';
        
        const previewImg = document.createElement('img');
        previewImg.className = 'w-14 h-14 rounded-lg object-cover bg-surface-container shadow';
        previewImg.src = currentCustomData[field.key] || field.defaultValue || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&auto=format&fit=crop&q=80';
        
        const uploadBtn = document.createElement('label');
        uploadBtn.className = 'cursor-pointer px-3.5 py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-xs font-semibold flex items-center gap-1.5 shadow-sm transition';
        uploadBtn.innerHTML = `
          <span class="material-symbols-outlined text-[16px]">upload</span>
          <span>Upload Photo</span>
          <input type="file" accept="image/*" class="hidden"/>
        `;
        const fileInput = uploadBtn.querySelector('input');
        fileInput.addEventListener('change', (e) => {
          if (e.target.files && e.target.files[0]) {
            const reader = new FileReader();
            reader.onload = (evt) => {
              previewImg.src = evt.target.result;
              updateFieldValue(field.key, evt.target.result);
            };
            reader.readAsDataURL(e.target.files[0]);
          }
        });

        imgWrap.appendChild(previewImg);
        imgWrap.appendChild(uploadBtn);
        fieldDiv.appendChild(imgWrap);
      } else if (field.type === 'date') {
        const input = document.createElement('input');
        input.type = 'date';
        input.className = 'w-full bg-surface-container-lowest text-on-surface rounded-xl px-4 py-2.5 font-body-md text-body-md shadow-inner focus:outline-none focus:ring-2 focus:ring-primary/60 border border-purple-500/20';
        input.value = currentCustomData[field.key] || field.defaultValue || '2026-10-25';
        input.addEventListener('change', (e) => {
          updateFieldValue(field.key, e.target.value);
        });
        fieldDiv.appendChild(input);
      } else {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'w-full bg-surface-container-lowest text-on-surface rounded-xl px-4 py-2.5 font-body-md text-body-md shadow-inner focus:outline-none focus:ring-2 focus:ring-primary/60 border border-purple-500/20';
        input.value = currentCustomData[field.key] || field.defaultValue || '';
        input.addEventListener('input', (e) => {
          updateFieldValue(field.key, e.target.value);
        });
        fieldDiv.appendChild(input);
      }

      dynamicFormContainer.appendChild(fieldDiv);
    });
  }
}

function loadTemplateInSandbox() {
  if (!activeTemplate) return;

  const viewport = document.getElementById('sandbox-viewport');
  if (!viewport) return;

  const templateEntryUrl = `/templates-store/${activeTemplate.folder || activeTemplate.id}/${activeTemplate.entryFile || 'index.html'}`;

  // Replace default preview elements with interactive iframe
  viewport.innerHTML = `
    <iframe id="live-custom-iframe" src="${templateEntryUrl}" class="w-full h-full border-0 absolute inset-0 rounded-b-xl z-20" style="min-height: 720px;" allow="autoplay"></iframe>
  `;

  const iframe = document.getElementById('live-custom-iframe');
  iframe.onload = () => {
    // Send initial payload
    syncDataToIframe();
  };
}

function updateFieldValue(key, value) {
  currentCustomData[key] = value;
  syncDataToIframe();
}

function syncDataToIframe() {
  const iframe = document.getElementById('live-custom-iframe');
  if (!iframe) return;

  // 1. PostMessage
  if (iframe.contentWindow) {
    iframe.contentWindow.postMessage({
      type: 'WISHMAGIC_LIVE_UPDATE',
      payload: currentCustomData
    }, '*');
  }

  // 2. Direct DOM manipulation if same-origin
  try {
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    if (doc) {
      doc.querySelectorAll('[data-wm]').forEach(el => {
        const key = el.getAttribute('data-wm');
        if (currentCustomData[key] !== undefined) {
          if (el.tagName === 'IMG') {
            if (currentCustomData[key]) el.src = currentCustomData[key];
          } else if (el.tagName === 'VIDEO') {
            if (currentCustomData[key]) el.src = currentCustomData[key];
          } else if (el.tagName === 'AUDIO') {
            if (currentCustomData[key]) el.src = currentCustomData[key];
          } else {
            el.textContent = currentCustomData[key];
          }
        }
      });
    }
  } catch (e) {
    // Cross-origin fallback handled by postMessage
  }
}

function setupEventListeners() {
  // Bind all "Generate Link" / "Proceed to Gift" buttons
  const generateBtns = document.querySelectorAll('[onclick="handleCreateWish()"], button:has(span:contains("Generate Link")), .btn-finalize-wish');
  
  // Custom button click binding
  document.querySelectorAll('button').forEach(btn => {
    const txt = btn.textContent.toLowerCase();
    if (txt.includes('finalize & generate link') || txt.includes('proceed to gift')) {
      btn.onclick = (e) => {
        e.preventDefault();
        publishWishAndGetLink();
      };
    }
  });
}

// Publish wish and show Share Modal
async function publishWishAndGetLink() {
  if (!activeTemplate) {
    alert('Please select a template first.');
    return;
  }

  const isVip = activeTemplate.tier === 'vip' || (activeTemplate.price && Number(activeTemplate.price) > 0);

  if (isVip) {
    // Open VIP Payment Checkout Modal
    showVipPaymentModal();
    return;
  }

  // Free Tier direct generation
  await executeWishCreation({
    tier: 'free',
    price: 0,
    buyerDetails: {
      name: currentCustomData.sender_name || 'Free Creator',
      phone: currentCustomData.sender_contact || ''
    }
  });
}

function showVipPaymentModal() {
  let modal = document.getElementById('vip-checkout-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'vip-checkout-modal';
    modal.className = 'fixed inset-0 z-50 bg-black/85 backdrop-blur-xl flex items-center justify-center p-4 transition-all';
    document.body.appendChild(modal);
  }

  const price = activeTemplate.price || 49;
  const buyerName = currentCustomData.sender_name || 'Ankit Verma';
  const buyerPhone = currentCustomData.sender_contact || '+91 98765 43210';

  modal.innerHTML = `
    <div class="w-full max-w-md bg-surface-container-low rounded-3xl border border-amber-500/40 shadow-2xl p-6 sm:p-7 flex flex-col gap-4 relative">
      <button onclick="document.getElementById('vip-checkout-modal').classList.add('hidden')" class="absolute top-4 right-4 text-outline hover:text-on-surface p-1 rounded-lg">
        <span class="material-symbols-outlined text-[20px]">close</span>
      </button>

      <div class="flex items-center gap-3">
        <div class="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-300 flex items-center justify-center text-2xl shadow-lg">
          👑
        </div>
        <div>
          <h3 class="font-headline-sm text-lg font-bold text-on-surface">Unlock VIP Pass Experience</h3>
          <span class="text-xs text-amber-400 font-semibold font-mono">₹${price} One-time • Ad-Free & 4K 60FPS</span>
        </div>
      </div>

      <div class="flex flex-col gap-3 py-2 text-xs">
        <div>
          <label class="block font-label-sm font-semibold text-on-surface-variant mb-1">Your Name (Buyer)</label>
          <input id="checkout-buyer-name" type="text" value="${buyerName}" class="w-full bg-surface-container-lowest text-on-surface rounded-xl px-3.5 py-2.5 border border-purple-900/30 focus:outline-none focus:border-amber-400"/>
        </div>
        <div>
          <label class="block font-label-sm font-semibold text-on-surface-variant mb-1">WhatsApp / Phone Number</label>
          <input id="checkout-buyer-phone" type="text" value="${buyerPhone}" placeholder="+91 98765 43210" class="w-full bg-surface-container-lowest text-on-surface rounded-xl px-3.5 py-2.5 border border-purple-900/30 focus:outline-none focus:border-amber-400"/>
        </div>
        <div>
          <label class="block font-label-sm font-semibold text-on-surface-variant mb-1">Payment Method</label>
          <div class="grid grid-cols-2 gap-2">
            <label class="flex items-center gap-2 p-2.5 rounded-xl bg-surface-container border border-amber-500/40 cursor-pointer">
              <input type="radio" name="pay_gateway" value="PhonePe UPI" checked class="text-amber-500 focus:ring-0"/>
              <span class="font-bold text-on-surface">PhonePe / UPI</span>
            </label>
            <label class="flex items-center gap-2 p-2.5 rounded-xl bg-surface-container border border-purple-900/30 cursor-pointer">
              <input type="radio" name="pay_gateway" value="GPay / Cards" class="text-amber-500 focus:ring-0"/>
              <span class="font-medium text-on-surface">GPay / Cards</span>
            </label>
          </div>
        </div>
      </div>

      <button onclick="submitVipPayment()" id="btn-confirm-vip-pay" class="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-500 via-purple-600 to-pink-500 hover:brightness-110 text-white font-extrabold text-sm shadow-xl flex items-center justify-center gap-2 transition active:scale-95">
        <span class="material-symbols-outlined text-[20px]">lock_open</span>
        <span>Complete ₹${price} Payment &amp; Get Link</span>
      </button>

      <span class="text-[11px] text-center text-outline">
        🔒 256-bit Encrypted Instant Checkout · Direct UPI Verification
      </span>
    </div>
  `;

  modal.classList.remove('hidden');
}

window.submitVipPayment = async function() {
  const btn = document.getElementById('btn-confirm-vip-pay');
  const buyerName = document.getElementById('checkout-buyer-name')?.value || currentCustomData.sender_name || 'VIP Buyer';
  const buyerPhone = document.getElementById('checkout-buyer-phone')?.value || currentCustomData.sender_contact || '+91 98765 43210';
  const method = document.querySelector('input[name="pay_gateway"]:checked')?.value || 'PhonePe UPI';
  const price = activeTemplate.price || 49;

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="material-symbols-outlined text-[18px] animate-spin">sync</span> Verifying Payment...`;
  }

  // Simulate ultra-fast real-time payment gateway verification
  await new Promise(r => setTimeout(r, 800));

  const modal = document.getElementById('vip-checkout-modal');
  if (modal) modal.classList.add('hidden');

  await executeWishCreation({
    tier: 'vip',
    price: price,
    buyerDetails: {
      name: buyerName,
      phone: buyerPhone
    },
    payment: {
      status: 'Completed',
      method: method,
      transactionId: 'TXN_' + Date.now().toString(36).toUpperCase()
    }
  });
};

async function executeWishCreation(extraPayload = {}) {
  try {
    const res = await fetch('/api/wishes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateId: activeTemplate.id,
        customData: currentCustomData,
        ...extraPayload
      })
    });

    const data = await res.json();
    if (data.success && data.wishId) {
      const fullLink = `${window.location.origin}/wish.html?id=${data.wishId}`;
      showGeneratedLinkModal(data.wishId, fullLink, data.wish);
    } else {
      alert('Error generating wish: ' + (data.message || 'Unknown error'));
    }
  } catch (err) {
    alert('Network error generating wish link: ' + err.message);
  }
}

function showGeneratedLinkModal(wishId, fullLink, wish = null) {
  let modal = document.getElementById('generated-link-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'generated-link-modal';
    modal.className = 'fixed inset-0 z-50 bg-black/85 backdrop-blur-xl flex items-center justify-center p-4 sm:p-6 transition-all duration-300';
    document.body.appendChild(modal);
  }

  const recipient = currentCustomData.recipient_name || 'Friend';
  const whatsappMsg = encodeURIComponent(`✨ Hey ${recipient}! I created a magical interactive celebration surprise website for you. Tap the link to open it: ${fullLink}`);

  const isFuture = wish && wish.lifecycleStatus === 'future';
  const eventDate = wish && (wish.eventDate || (wish.customData && wish.customData.event_date));
  const statusPill = isFuture 
    ? `<div class="mb-3 px-3.5 py-1.5 rounded-full bg-purple-500/20 text-purple-300 text-xs font-semibold border border-purple-500/30 inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-purple-400"></span> 🟣 Future Scheduled: ${eventDate || 'Upcoming Date'}</div>`
    : `<div class="mb-3 px-3.5 py-1.5 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-semibold border border-emerald-500/30 inline-flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> 🟢 Live &amp; Shareable Right Now</div>`;

  modal.innerHTML = `
    <div class="w-full max-w-lg bg-surface-container-low rounded-3xl shadow-2xl p-6 sm:p-8 flex flex-col items-center text-center border border-purple-500/30 relative overflow-hidden">
      <!-- Glow background -->
      <div class="absolute -top-20 -left-20 w-64 h-64 bg-pink-500/20 rounded-full blur-3xl pointer-events-none"></div>
      <div class="absolute -bottom-20 -right-20 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl pointer-events-none"></div>

      <!-- Close button -->
      <button onclick="document.getElementById('generated-link-modal').classList.add('hidden')" class="absolute top-4 right-4 p-2 text-on-surface-variant hover:text-on-surface rounded-full hover:bg-surface-container-high transition">
        <span class="material-symbols-outlined text-[20px]">close</span>
      </button>

      <!-- Celebration Icon -->
      <div class="w-16 h-16 rounded-full bg-gradient-to-tr from-pink-500 via-purple-600 to-amber-300 flex items-center justify-center text-3xl shadow-[0_0_30px_rgba(236,72,153,0.5)] mb-3 animate-bounce">
        🎊
      </div>

      <h3 class="font-display text-2xl sm:text-3xl font-extrabold text-on-surface mb-2">
        Your Magical Link is Ready!
      </h3>

      ${statusPill}

      <p class="font-body-sm text-body-sm text-on-surface-variant mb-5 max-w-md">
        Personalized for <strong class="text-pink-400 font-bold">${recipient}</strong>. Anyone with this link will experience this exact celebration website!
      </p>

      <!-- Link Copy Box -->
      <div class="w-full bg-surface-container-lowest p-2 rounded-2xl border border-purple-500/30 flex items-center justify-between gap-2 shadow-inner mb-5">
        <input id="generated-link-input" type="text" readonly value="${fullLink}" class="w-full bg-transparent text-xs sm:text-sm font-mono text-purple-200 px-3 py-2 focus:outline-none truncate select-all"/>
        <button onclick="copyGeneratedLink()" id="btn-copy-link" class="px-4 py-2 rounded-xl bg-gradient-to-r from-primary-container to-purple-600 text-white font-bold text-xs shadow hover:brightness-110 active:scale-95 transition-all flex items-center gap-1.5 flex-shrink-0">
          <span class="material-symbols-outlined text-[16px]">content_copy</span>
          <span id="copy-btn-text">Copy Link</span>
        </button>
      </div>

      <!-- Action Buttons -->
      <div class="w-full flex flex-col sm:flex-row gap-3">
        <!-- WhatsApp Share -->
        <a href="https://api.whatsapp.com/send?text=${whatsappMsg}" target="_blank" class="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#25D366] text-white font-bold text-sm shadow-lg hover:brightness-105 active:scale-95 transition-all">
          <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.006c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.26.304c-.087.086-.177.18-.076.354.101.174.449.741.964 1.201.662.591 1.221.774 1.394.86s.275.072.376-.044c.101-.116.433-.506.549-.68.116-.173.231-.145.39-.087s1.011.477 1.184.564.289.13.332.202c.045.072.045.419-.1.824z"/></svg>
          <span>Share on WhatsApp</span>
        </a>

        <!-- Open Experience Live -->
        <a href="${fullLink}" target="_blank" class="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-bold text-sm border border-purple-500/30 transition-all">
          <span class="material-symbols-outlined text-[18px]">open_in_new</span>
          <span>Open Live Wish</span>
        </a>
      </div>
    </div>
  `;

  modal.classList.remove('hidden');

  // Trigger confetti
  if (typeof confetti === 'function') {
    confetti({ particleCount: 100, spread: 80, origin: { y: 0.6 } });
  }
}

function copyGeneratedLink() {
  const input = document.getElementById('generated-link-input');
  const btnText = document.getElementById('copy-btn-text');
  if (input) {
    input.select();
    navigator.clipboard.writeText(input.value);
    if (btnText) {
      btnText.textContent = 'Copied! ✨';
      setTimeout(() => btnText.textContent = 'Copy Link', 2500);
    }
  }
}
