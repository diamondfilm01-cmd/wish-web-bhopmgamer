// WishMagic Universal Wish Experience Renderer

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const wishId = urlParams.get('id');

  if (!wishId) {
    // If opened directly without id, show interactive demo celebration or redirect
    console.log('No wish ID provided, showing default interactive experience');
    return;
  }

  try {
    const res = await fetch(`/api/wishes/${wishId}`);
    const result = await res.json();

    if (!result.success || !result.wish) {
      console.warn('Wish not found or expired:', wishId);
      window.location.href = 'expired.html?id=' + encodeURIComponent(wishId);
      return;
    }

    const { wish, template } = result;
    const customData = wish.customData || {};

    // 1. If it's an uploaded custom template website
    if (template && template.folder) {
      renderCustomTemplateWebsite(template, customData, wishId);
      return;
    }

    // 2. Otherwise hydrate standard page elements
    hydrateStandardWishPage(customData);
  } catch (err) {
    console.error('Error fetching wish experience:', err);
  }
});

function renderCustomTemplateWebsite(template, customData, wishId) {
  // Hide default HTML body content and replace with full-viewport template iframe
  const templatePath = `/templates-store/${template.folder}/${template.entryFile || 'index.html'}`;

  document.body.innerHTML = `
    <!-- Full-screen Custom Website Experience Container -->
    <div class="fixed inset-0 w-screen h-screen z-10 bg-black overflow-hidden flex flex-col">
      
      <!-- Sleek Floating Celebration Toolbar -->
      <div class="absolute top-3 inset-x-3 sm:inset-x-6 z-40 flex items-center justify-between pointer-events-none">
        
        <!-- Left: Brand & Recipient Pill -->
        <div class="pointer-events-auto flex items-center gap-2 bg-black/60 backdrop-blur-xl border border-white/20 px-3.5 py-1.5 rounded-full shadow-2xl text-white">
          <div class="w-6 h-6 rounded-full bg-gradient-to-tr from-pink-500 via-purple-600 to-amber-300 flex items-center justify-center text-xs">
            ✨
          </div>
          <span class="text-xs font-bold text-white/90">
            For <span class="text-pink-300">${customData.recipient_name || 'You'}</span>
          </span>
          ${customData.sender_name ? `<span class="text-[10px] text-white/60">from ${customData.sender_name}</span>` : ''}
        </div>

        <!-- Right: Action Buttons -->
        <div class="pointer-events-auto flex items-center gap-2">
          <!-- Confetti Burst Button -->
          <button onclick="triggerFloatingConfetti()" class="p-2 sm:px-3 sm:py-1.5 rounded-full bg-black/60 backdrop-blur-xl border border-white/20 text-white text-xs font-bold shadow-xl hover:bg-black/80 hover:scale-105 active:scale-95 transition-all flex items-center gap-1.5">
            <span>🎉</span>
            <span class="hidden sm:inline">Burst Confetti</span>
          </button>

          <!-- WhatsApp Share -->
          <button onclick="shareWishOnWhatsApp('${customData.recipient_name || 'Friend'}')" class="p-2 sm:px-3 sm:py-1.5 rounded-full bg-[#25D366]/90 backdrop-blur-xl text-white text-xs font-bold shadow-xl hover:brightness-110 hover:scale-105 active:scale-95 transition-all flex items-center gap-1.5">
            <svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.006c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.26.304c-.087.086-.177.18-.076.354.101.174.449.741.964 1.201.662.591 1.221.774 1.394.86s.275.072.376-.044c.101-.116.433-.506.549-.68.116-.173.231-.145.39-.087s1.011.477 1.184.564.289.13.332.202c.045.072.045.419-.1.824z"/></svg>
            <span class="hidden sm:inline">Share</span>
          </button>

          <!-- Create Your Own Wish -->
          <a href="/index.html" class="px-3.5 py-1.5 rounded-full bg-gradient-to-r from-pink-500 via-purple-600 to-indigo-600 text-white text-xs font-extrabold shadow-xl hover:brightness-110 hover:scale-105 active:scale-95 transition-all flex items-center gap-1">
            <span>✨ Create Yours</span>
          </a>
        </div>
      </div>

      <!-- Main Template Website Iframe -->
      <iframe id="wish-experience-iframe" src="${templatePath}" class="w-full h-full border-0 flex-1" allow="autoplay; camera; microphone"></iframe>
    </div>
  `;

  // Apply customizations to iframe once loaded
  const iframe = document.getElementById('wish-experience-iframe');
  iframe.onload = () => {
    // 1. PostMessage
    iframe.contentWindow.postMessage({
      type: 'WISHMAGIC_INIT',
      payload: customData
    }, '*');

    // 2. Direct DOM hydration (since same-origin)
    try {
      const doc = iframe.contentDocument || iframe.contentWindow.document;
      if (doc) {
        doc.querySelectorAll('[data-wm]').forEach(el => {
          const key = el.getAttribute('data-wm');
          if (customData[key] !== undefined) {
            if (el.tagName === 'IMG') {
              if (customData[key]) el.src = customData[key];
            } else if (el.tagName === 'VIDEO') {
              if (customData[key]) el.src = customData[key];
            } else if (el.tagName === 'AUDIO') {
              if (customData[key]) el.src = customData[key];
            } else {
              el.textContent = customData[key];
            }
          }
        });

        iframe.contentWindow.WishMagicData = customData;
      }
    } catch (e) {
      console.log('Cross-origin DOM access restricted; using postMessage payload');
    }
  };
}

function hydrateStandardWishPage(customData) {
  if (customData.recipient_name) {
    document.querySelectorAll('.recipient-name, [data-wm="recipient_name"]').forEach(el => {
      el.textContent = customData.recipient_name;
    });
  }

  if (customData.sender_name) {
    document.querySelectorAll('.sender-name, [data-wm="sender_name"]').forEach(el => {
      el.textContent = customData.sender_name;
    });
  }

  if (customData.custom_message) {
    document.querySelectorAll('.custom-message, [data-wm="custom_message"]').forEach(el => {
      el.textContent = customData.custom_message;
    });
  }

  if (customData.photo_1) {
    document.querySelectorAll('.celebrant-photo, [data-wm="photo_1"]').forEach(el => {
      el.src = customData.photo_1;
    });
  }
}

function triggerFloatingConfetti() {
  const iframe = document.getElementById('wish-experience-iframe');
  if (iframe && iframe.contentWindow && typeof iframe.contentWindow.blastConfetti === 'function') {
    iframe.contentWindow.blastConfetti();
  }
  if (typeof confetti === 'function') {
    confetti({ particleCount: 100, spread: 80, origin: { y: 0.6 } });
  }
}

function shareWishOnWhatsApp(recipient) {
  const msg = encodeURIComponent(`✨ Hey ${recipient}! Open this magical personalized celebration website made specially for you: ${window.location.href}`);
  window.open(`https://api.whatsapp.com/send?text=${msg}`, '_blank');
}
