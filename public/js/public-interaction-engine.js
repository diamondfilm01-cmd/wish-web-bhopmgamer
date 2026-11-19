(function(window2){"use strict";const WishInteractionRegistry={INTERACTION_TYPES:{HERO_REVEAL:"hero_reveal",GALLERY_LIGHTBOX:"gallery_lightbox",MEMORY_FLIP:"memory_flip",TIMELINE_EXPAND:"timeline_expand",OPEN_WHEN_MODAL:"open_when_modal",SECRET_VAULT:"secret_vault",FINAL_SURPRISE:"final_surprise",AUDIO_PLAYER:"audio_player",VOICE_NOTE_PLAYER:"voice_note_player",CELEBRATION_BURST:"celebration_burst"},DEFAULT_CONFIGS:{lightbox:{enableSwipe:!0,enableKeyboard:!0,loop:!0,showCaptions:!0},secretVault:{requirePassword:!1,showHint:!0,shakeOnError:!0,maxAttempts:10},finalSurprise:{steps:3,triggerConfetti:!0,celebrationDurationMs:3e3}}},WishInteractionEngine={activeModal:null,lastFocusedElement:null,historyStatePushed:!1,lightbox:{isOpen:!1,images:[],currentIndex:0,touchStartX:0,touchEndX:0,touchStartY:0},finalSurprise:{currentStep:1,totalSteps:3,isCompleted:!1},secretVault:{isUnlocked:!1,storedPassword:"",secretText:"",hint:""},init(){this.bindKeyboardShortcuts(),this.bindHistoryPopstate(),this.injectInteractiveStyles()},injectInteractiveStyles(){if(document.getElementById("wishmagic-interaction-styles"))return;const style=document.createElement("style");style.id="wishmagic-interaction-styles",style.textContent=`
        /* Part 14: Interactive Keyframes and Transitions */
        .wm-card-flip-container {
          perspective: 1000px;
        }
        .wm-card-flip-inner {
          transition: transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
          transform-style: preserve-3d;
        }
        .wm-card-flipped {
          transform: rotateY(180deg);
        }
        .wm-card-face-back {
          transform: rotateY(180deg);
          backface-visibility: hidden;
        }
        .wm-card-face-front {
          backface-visibility: hidden;
        }

        /* Shake animation for invalid vault password */
        @keyframes wmShake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-8px); }
          40%, 80% { transform: translateX(8px); }
        }
        .wm-shake-error {
          animation: wmShake 0.45s ease-in-out !important;
        }

        /* Smooth accordion */
        .wm-accordion-content {
          max-height: 0;
          overflow: hidden;
          transition: max-height 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
          opacity: 0;
        }
        .wm-accordion-expanded .wm-accordion-content {
          max-height: 600px;
          opacity: 1;
        }

        /* Lightbox transitions */
        .wm-lightbox-backdrop {
          transition: opacity 0.25s ease-out;
        }
        .wm-lightbox-img {
          transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease;
          max-height: 82vh;
          max-width: 90vw;
          object-fit: contain;
          touch-action: pan-y pinch-zoom;
        }

        /* Touch target discipline */
        .wm-touch-target {
          min-width: 44px;
          min-height: 44px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        /* Reduced motion override */
        @media (prefers-reduced-motion: reduce) {
          .wm-card-flip-inner, .wm-shake-error, .wm-accordion-content, .wm-lightbox-backdrop {
            transition: none !important;
            animation: none !important;
          }
        }
      `,document.head.appendChild(style)},bindKeyboardShortcuts(){document.addEventListener("keydown",e=>{e.key==="Escape"&&(this.lightbox.isOpen?this.closeLightbox():this.activeModal&&this.closeActiveModal()),this.lightbox.isOpen&&(e.key==="ArrowRight"||e.key==="Right"?this.navigateLightbox(1):(e.key==="ArrowLeft"||e.key==="Left")&&this.navigateLightbox(-1))})},bindHistoryPopstate(){window2.addEventListener("popstate",e=>{this.lightbox.isOpen?this.closeLightbox(!1):this.activeModal&&this.closeActiveModal(!1)})},pushOverlayState(){if(!this.historyStatePushed&&window2.history&&window2.history.pushState)try{window2.history.pushState({wmOverlay:!0},""),this.historyStatePushed=!0}catch{}},clearOverlayState(){if(this.historyStatePushed){this.historyStatePushed=!1;try{window2.history&&window2.history.state&&window2.history.state.wmOverlay&&window2.history.back()}catch{}}},openModal(modalElement,triggerEl){if(!modalElement)return;this.lastFocusedElement=triggerEl||document.activeElement,this.activeModal=modalElement,modalElement.classList.remove("hidden"),modalElement.setAttribute("aria-hidden","false");const focusable=modalElement.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');focusable.length>0&&focusable[0].focus(),this.pushOverlayState(),document.body.style.overflow="hidden"},closeActiveModal(shouldPopHistory=!0){this.activeModal&&(this.activeModal.classList.add("hidden"),this.activeModal.setAttribute("aria-hidden","true"),this.activeModal=null,document.body.style.overflow="",shouldPopHistory&&this.clearOverlayState(),this.lastFocusedElement&&typeof this.lastFocusedElement.focus=="function"&&(this.lastFocusedElement.focus(),this.lastFocusedElement=null))},openLightbox(images=[],initialIndex=0,triggerEl=null){if(!images||images.length===0)return;this.lastFocusedElement=triggerEl||document.activeElement,this.lightbox.images=images.map(img=>typeof img=="string"?{url:img,caption:"",title:""}:img),this.lightbox.currentIndex=Math.max(0,Math.min(initialIndex,this.lightbox.images.length-1)),this.lightbox.isOpen=!0;let lbModal=document.getElementById("wm-global-lightbox-modal");lbModal||(lbModal=this.createLightboxDOM()),this.updateLightboxDisplay(),lbModal.classList.remove("hidden"),lbModal.setAttribute("aria-hidden","false"),this.pushOverlayState(),document.body.style.overflow="hidden";const closeBtn=document.getElementById("wm-lb-close-btn");closeBtn&&closeBtn.focus()},createLightboxDOM(){let modal=document.createElement("div");return modal.id="wm-global-lightbox-modal",modal.className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/90 backdrop-blur-2xl wm-lightbox-backdrop select-none",modal.setAttribute("role","dialog"),modal.setAttribute("aria-modal","true"),modal.setAttribute("aria-label","Photo keepsakes lightbox"),modal.innerHTML=`
        <!-- Top Toolbar -->
        <div class="absolute top-4 left-4 right-4 z-20 flex items-center justify-between text-white pointer-events-none">
          <div class="pointer-events-auto px-3 py-1.5 rounded-full bg-black/50 backdrop-blur-md border border-white/20 text-xs font-mono font-bold tracking-wider">
            <span id="wm-lb-counter">1 / 1</span>
          </div>

          <button id="wm-lb-close-btn" onclick="WishInteractionEngine.closeLightbox()" class="pointer-events-auto wm-touch-target rounded-full bg-white/15 hover:bg-white/30 text-white font-bold transition active:scale-95 cursor-pointer shadow-lg" aria-label="Close Lightbox (Esc)">
            \u2715
          </button>
        </div>

        <!-- Previous Button -->
        <button id="wm-lb-prev-btn" onclick="WishInteractionEngine.navigateLightbox(-1)" class="absolute left-2 sm:left-6 top-1/2 -translate-y-1/2 z-20 wm-touch-target rounded-full bg-black/50 hover:bg-black/80 border border-white/20 text-white font-bold transition active:scale-90 cursor-pointer shadow-2xl" aria-label="Previous Photo (Left Arrow)">
          \u2039
        </button>

        <!-- Next Button -->
        <button id="wm-lb-next-btn" onclick="WishInteractionEngine.navigateLightbox(1)" class="absolute right-2 sm:right-6 top-1/2 -translate-y-1/2 z-20 wm-touch-target rounded-full bg-black/50 hover:bg-black/80 border border-white/20 text-white font-bold transition active:scale-90 cursor-pointer shadow-2xl" aria-label="Next Photo (Right Arrow)">
          \u203A
        </button>

        <!-- Image Presentation Container -->
        <div id="wm-lb-stage" class="relative max-w-4xl max-h-[85vh] flex flex-col items-center justify-center z-10">
          <img id="wm-lb-image" src="" alt="Celebration photo keepsake" class="wm-lightbox-img rounded-2xl shadow-2xl border border-white/20 bg-black/40"/>
          
          <!-- Caption / Memory Details -->
          <div id="wm-lb-caption-box" class="mt-3 px-4 py-2 rounded-2xl bg-black/60 backdrop-blur-md border border-white/15 max-w-lg text-center text-xs text-white/90">
            <h4 id="wm-lb-title" class="font-bold text-sm text-pink-300"></h4>
            <p id="wm-lb-caption" class="text-xs text-white/80 mt-0.5 font-medium"></p>
          </div>
        </div>
      `,modal.addEventListener("touchstart",e=>{this.lightbox.touchStartX=e.changedTouches[0].screenX,this.lightbox.touchStartY=e.changedTouches[0].screenY},{passive:!0}),modal.addEventListener("touchend",e=>{this.lightbox.touchEndX=e.changedTouches[0].screenX;const touchEndY=e.changedTouches[0].screenY,diffX=this.lightbox.touchStartX-this.lightbox.touchEndX,diffY=Math.abs(this.lightbox.touchStartY-touchEndY);Math.abs(diffX)>50&&diffY<100&&(diffX>0?this.navigateLightbox(1):this.navigateLightbox(-1))},{passive:!0}),modal.addEventListener("click",e=>{(e.target===modal||e.target.id==="wm-lb-stage")&&this.closeLightbox()}),document.body.appendChild(modal),modal},updateLightboxDisplay(){const cur=this.lightbox.images[this.lightbox.currentIndex];if(!cur)return;const imgEl=document.getElementById("wm-lb-image"),counterEl=document.getElementById("wm-lb-counter"),titleEl=document.getElementById("wm-lb-title"),captionEl=document.getElementById("wm-lb-caption"),captionBox=document.getElementById("wm-lb-caption-box");imgEl&&(imgEl.style.opacity="0",imgEl.src=cur.url||cur.src||"",imgEl.alt=cur.title||cur.caption||`Keepsake ${this.lightbox.currentIndex+1}`,setTimeout(()=>{imgEl.style.opacity="1"},50)),counterEl&&(counterEl.textContent=`${this.lightbox.currentIndex+1} / ${this.lightbox.images.length}`);const hasTitle=!!(cur.title||cur.name),hasCaption=!!(cur.caption||cur.description);titleEl&&(titleEl.textContent=cur.title||cur.name||""),captionEl&&(captionEl.textContent=cur.caption||cur.description||""),captionBox&&(!hasTitle&&!hasCaption?captionBox.classList.add("hidden"):captionBox.classList.remove("hidden"))},navigateLightbox(step){if(!this.lightbox.isOpen||this.lightbox.images.length<=1)return;const count=this.lightbox.images.length;this.lightbox.currentIndex=(this.lightbox.currentIndex+step+count)%count,this.updateLightboxDisplay()},closeLightbox(shouldPopHistory=!0){const modal=document.getElementById("wm-global-lightbox-modal");modal&&(modal.classList.add("hidden"),modal.setAttribute("aria-hidden","true")),this.lightbox.isOpen=!1,document.body.style.overflow="",shouldPopHistory&&this.clearOverlayState(),this.lastFocusedElement&&typeof this.lastFocusedElement.focus=="function"&&(this.lastFocusedElement.focus(),this.lastFocusedElement=null)},openEnvelopeCard(cardData,triggerEl){let modal=document.getElementById("wm-open-when-modal");modal||(modal=document.createElement("div"),modal.id="wm-open-when-modal",modal.className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-xl",modal.setAttribute("role","dialog"),modal.setAttribute("aria-modal","true"),modal.setAttribute("aria-label","Open When letter"),document.body.appendChild(modal));const title=cardData.title||"Special Letter",message=cardData.message||cardData.text||"A heartfelt note for you...",color=cardData.color||"#ec4899",image=cardData.image||cardData.imageUrl||null;modal.innerHTML=`
        <div class="relative w-full max-w-lg rounded-3xl bg-[#130628] border border-white/20 p-6 sm:p-8 text-white shadow-2xl overflow-hidden animate-scale-up">
          <!-- Atmosphere Aura Glow -->
          <div class="absolute -top-16 -right-16 w-44 h-44 rounded-full blur-3xl opacity-35 pointer-events-none" style="background-color: ${escapeHTML(color)};"></div>

          <!-- Close Button -->
          <button onclick="WishInteractionEngine.closeActiveModal()" class="absolute top-4 right-4 wm-touch-target rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition cursor-pointer" aria-label="Close Letter">
            \u2715
          </button>

          <!-- Header -->
          <div class="flex items-center gap-3.5 mb-4">
            <div class="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shadow-lg border border-white/20" style="background: linear-gradient(135deg, ${escapeHTML(color)} 0%, #3b0764 100%);">
              \u{1F48C}
            </div>
            <div>
              <span class="text-[10px] uppercase font-mono tracking-widest text-pink-300 font-bold block">Heartfelt Keepsake</span>
              <h3 class="text-base sm:text-lg font-bold text-white leading-tight">${escapeHTML(title)}</h3>
            </div>
          </div>

          <!-- Letter Message Box -->
          <div class="p-5 sm:p-6 rounded-2xl bg-white/5 border border-white/15 my-4 space-y-3">
            <p class="text-sm sm:text-base font-serif italic text-purple-100 leading-relaxed">
              "${escapeHTML(message)}"
            </p>
            ${image?`
              <div class="pt-2">
                <img src="${escapeHTML(image)}" alt="${escapeHTML(title)}" class="w-full max-h-48 object-cover rounded-xl border border-white/15 shadow-md"/>
              </div>
            `:""}
          </div>

          <!-- Footer Actions -->
          <div class="flex items-center justify-between pt-2">
            <span class="text-[11px] text-white/50 font-sans">Crafted with endless love \u2726</span>
            <button onclick="WishInteractionEngine.closeActiveModal()" class="px-5 py-2.5 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 text-white text-xs font-bold shadow-md hover:brightness-110 active:scale-95 transition cursor-pointer">
              Close Letter \u{1F496}
            </button>
          </div>
        </div>
      `,this.openModal(modal,triggerEl),this.triggerCelebration("sparkles",30)},configureSecretVault(config={}){this.secretVault.isUnlocked=!1,this.secretVault.storedPassword=(config.password||"").trim().toLowerCase(),this.secretVault.secretText=config.secretText||config.message||"You hold the key to the most beautiful memories!",this.secretVault.hint=config.hint||""},unlockSecretVaultDirectly(){this.secretVault.isUnlocked=!0,this.renderVaultRevealedState(),this.triggerCelebration("confetti",60)},attemptVaultPasswordUnlock(inputPassword){const entered=(inputPassword||"").trim().toLowerCase(),expected=this.secretVault.storedPassword,vaultBox=document.getElementById("wm-secret-vault-box"),errorMsg=document.getElementById("wm-vault-error-msg");!expected||entered===expected?(this.secretVault.isUnlocked=!0,this.renderVaultRevealedState(),this.triggerCelebration("confetti",70)):(vaultBox&&(vaultBox.classList.remove("wm-shake-error"),vaultBox.offsetWidth,vaultBox.classList.add("wm-shake-error")),errorMsg&&(errorMsg.textContent="Incorrect key code. Please try again!",errorMsg.classList.remove("hidden")))},renderVaultRevealedState(){const sealedBox=document.getElementById("wm-vault-sealed-state"),revealedBox=document.getElementById("wm-vault-revealed-state"),secretContentEl=document.getElementById("wm-vault-secret-content");sealedBox&&sealedBox.classList.add("hidden"),revealedBox&&revealedBox.classList.remove("hidden"),secretContentEl&&(secretContentEl.textContent=this.secretVault.secretText)},advanceFinalSurpriseStep(targetStep,finaleConfig={}){const step1=document.getElementById("wm-finale-step-1"),step2=document.getElementById("wm-finale-step-2"),step3=document.getElementById("wm-finale-step-3");targetStep===2?(step1&&step1.classList.add("hidden"),step2&&step2.classList.remove("hidden"),this.triggerCelebration("sparkles",40)):targetStep===3&&(step2&&step2.classList.add("hidden"),step3&&step3.classList.remove("hidden"),this.triggerCelebration("confetti",120),window2.WishRenderer&&typeof window2.WishRenderer.launchFireworks=="function"&&window2.WishRenderer.launchFireworks())},toggleMemoryCardFlip(cardElement){cardElement&&cardElement.classList.toggle("wm-card-flipped")},toggleTimelineItem(itemElement){if(!itemElement)return;const isExpanded=itemElement.classList.contains("wm-accordion-expanded");itemElement.classList.toggle("wm-accordion-expanded");const btn=itemElement.querySelector("button[aria-expanded]");btn&&btn.setAttribute("aria-expanded",isExpanded?"false":"true")},scrollToSection(sectionId){const sec=document.getElementById(`section-${sectionId}`)||document.getElementById(sectionId);if(!sec)return;const prefersReduced=window2.matchMedia&&window2.matchMedia("(prefers-reduced-motion: reduce)").matches;sec.scrollIntoView({behavior:prefersReduced?"auto":"smooth",block:"start"})},triggerCelebration(type="confetti",count=80){if(type==="confetti")typeof window2.confetti=="function"&&window2.confetti({particleCount:count,spread:80,origin:{y:.6}});else if(window2.WishParticleEngine&&typeof window2.WishParticleEngine.triggerBurst=="function"){const x=window2.innerWidth/2,y=window2.innerHeight/2;window2.WishParticleEngine.triggerBurst(x,y,type,count)}}};function escapeHTML(str){return str?String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;"):""}typeof document<"u"&&(document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>WishInteractionEngine.init()):WishInteractionEngine.init()),window2.WishInteractionRegistry=WishInteractionRegistry,window2.WishInteractionEngine=WishInteractionEngine})(typeof window<"u"?window:this);
