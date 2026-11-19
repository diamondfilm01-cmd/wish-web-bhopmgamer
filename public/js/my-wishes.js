(function(window2){"use strict";let allWishes=[],currentFilter="all",currentSearch="",currentSort="recent",favoriteIds=new Set,selectedWishForAction=null,isLoading=!1;document.addEventListener("DOMContentLoaded",async()=>{setupEventListeners(),await handleAuthSync(),window2.WishAuth&&window2.WishAuth.onAuthStateChange(async()=>{await handleAuthSync()})});async function handleAuthSync(){const user=window2.WishAuth?window2.WishAuth.getCurrentUser():null,barrier=document.getElementById("wishes-auth-barrier"),authView=document.getElementById("wishes-authenticated-view");if(!user){barrier&&barrier.classList.remove("hidden"),authView&&authView.classList.add("hidden"),allWishes=[],favoriteIds.clear();return}barrier&&barrier.classList.add("hidden"),authView&&authView.classList.remove("hidden"),await fetchServerFavorites(user.id),await migrateLocalGuestDraftsToServer(user.id),await fetchWishesAndDrafts(user.id),renderDashboard()}function getAuthHeaders(){const headers={Accept:"application/json"};try{if(window2.WishAuth){const session=window2.WishAuth.getSession();session&&session.token&&(headers.Authorization=`Bearer ${session.token}`)}}catch{}return headers}async function fetchServerFavorites(userId){if(!userId){favoriteIds=new Set;return}try{const data=await(await fetch("/api/favorites",{headers:getAuthHeaders(),credentials:"include"})).json();data&&data.success&&Array.isArray(data.favorites)&&(favoriteIds=new Set(data.favorites))}catch(e){console.warn("[my-wishes] Error loading server favorites:",e)}}async function migrateLocalGuestDraftsToServer(userId){if(userId)try{const rawDrafts=localStorage.getItem("wishmagic_drafts");if(!rawDrafts)return;const drafts=JSON.parse(rawDrafts);if(!Array.isArray(drafts)||drafts.length===0)return;for(const draft of drafts)if(!draft.userId||draft.userId==="guest"||draft.userId===userId)try{await fetch("/api/wishes",{method:"POST",headers:{...getAuthHeaders(),"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({templateId:draft.templateId||"tpl_glitter_birthday",status:"draft",isDraft:!0,customData:{...draft.customData||{},recipient_name:draft.recipientName||draft.customData?.recipient_name||"Special Person",sender_name:draft.senderName||draft.customData?.sender_name||"Creator",event_date:draft.eventDate||draft.customData?.event_date||new Date().toISOString().split("T")[0],isDraft:!0}})})}catch(err){console.warn("[my-wishes] Guest draft migration failed for draft:",draft.id,err)}localStorage.removeItem("wishmagic_drafts")}catch(e){console.warn("[my-wishes] Error checking guest drafts migration:",e)}}async function fetchWishesAndDrafts(userId){if(!userId){allWishes=[];return}isLoading=!0;try{const res=await fetch("/api/wishes",{headers:getAuthHeaders(),credentials:"include"});if(res.status===401){window2.WishAuth&&window2.WishAuth.requireAuth(),allWishes=[];return}const data=await res.json();data&&data.success&&Array.isArray(data.wishes)?allWishes=data.wishes.map(w=>{const isDraft=!!(w.status==="draft"||w.isDraft||w.customData&&w.customData.isDraft),lifecycleStatus=isDraft?"draft":window2.WishLifecycle?window2.WishLifecycle.getWishStatus(w):w.lifecycleStatus||"active";return{...w,status:isDraft?"draft":w.status||"published",isDraft,lifecycleStatus,favorite:favoriteIds.has(w.id)}}):allWishes=[]}catch(err){console.error("[my-wishes] Error fetching wishes from server:",err),allWishes=[]}finally{isLoading=!1}}function setupEventListeners(){const searchInput=document.getElementById("search-wishes-input"),clearBtn=document.getElementById("search-clear-btn");searchInput&&searchInput.addEventListener("input",e=>{currentSearch=e.target.value.trim().toLowerCase(),clearBtn&&(currentSearch.length>0?clearBtn.classList.remove("hidden"):clearBtn.classList.add("hidden")),renderDashboard()}),clearBtn&&clearBtn.addEventListener("click",()=>{searchInput&&(searchInput.value=""),currentSearch="",clearBtn.classList.add("hidden"),renderDashboard()});const sortSelect=document.getElementById("sort-wishes-select");sortSelect&&sortSelect.addEventListener("change",e=>{currentSort=e.target.value,renderDashboard()})}window2.setDashboardFilter=function(filterName){currentFilter=filterName,document.querySelectorAll(".filter-tab-btn").forEach(btn=>{btn.getAttribute("data-tab")===filterName?btn.className="filter-tab-btn px-4 py-2 rounded-full font-bold text-xs sm:text-sm bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-md shadow-pink-500/25 flex items-center gap-2 transition-all cursor-pointer flex-shrink-0":btn.className="filter-tab-btn px-4 py-2 rounded-full font-semibold text-xs sm:text-sm glass-pill text-purple-900 dark:text-purple-200 hover:text-pink-600 dark:hover:text-pink-300 flex items-center gap-2 transition-all cursor-pointer flex-shrink-0"}),renderDashboard()},window2.toggleFavorite=async function(wishId,e){if(e&&(e.stopPropagation(),e.preventDefault()),!(window2.WishAuth?window2.WishAuth.getCurrentUser():null)){window2.WishAuth&&window2.WishAuth.requireAuth({message:"Please sign in to favorite your celebrations."});return}const currentlyFav=favoriteIds.has(wishId);currentlyFav?favoriteIds.delete(wishId):favoriteIds.add(wishId);const target=allWishes.find(w=>w.id===wishId);target&&(target.favorite=!currentlyFav),renderDashboard(),showDashboardToast(currentlyFav?"Removed from Favorites \u{1F494}":"Added to Favorites \u2764\uFE0F");try{const data=await(await fetch("/api/favorites",{method:"POST",headers:{...getAuthHeaders(),"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({itemId:wishId,itemType:"wish"})})).json();data&&data.success&&typeof data.favorited=="boolean"&&(data.favorited?favoriteIds.add(wishId):favoriteIds.delete(wishId),target&&(target.favorite=data.favorited),renderDashboard())}catch(err){console.warn("[my-wishes] Failed to sync favorite with server:",err)}};function getRelationshipDisplay(w){const cd=w.customData||{},relId=w.relationship||w.relationshipId||w.relationship_id||cd.relationship||cd.relationshipId||cd.relationship_id||cd.relationship_label||"";if(!relId)return null;const relMap={crush:{label:"Crush",icon:"favorite",bgClass:"bg-pink-500/15 text-pink-700 dark:text-pink-300 border-pink-500/30"},partner:{label:"Partner",icon:"favorite",bgClass:"bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30"},spouse:{label:"Spouse",icon:"favorite",bgClass:"bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30"},best_friend:{label:"Best Friend",icon:"sentiment_very_satisfied",bgClass:"bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"},friend:{label:"Friend",icon:"sentiment_satisfied",bgClass:"bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"},parent:{label:"Parents",icon:"diversity_1",bgClass:"bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30"},parents:{label:"Parents",icon:"diversity_1",bgClass:"bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30"},mom:{label:"Mom",icon:"family_restroom",bgClass:"bg-pink-500/15 text-pink-700 dark:text-pink-300 border-pink-500/30"},dad:{label:"Dad",icon:"family_restroom",bgClass:"bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30"},sibling:{label:"Sibling",icon:"diversity_3",bgClass:"bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30"},brother:{label:"Brother",icon:"diversity_3",bgClass:"bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30"},sister:{label:"Sister",icon:"diversity_3",bgClass:"bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/30"},mentor:{label:"Mentor",icon:"school",bgClass:"bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"},colleague:{label:"Colleague",icon:"work",bgClass:"bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30"},self:{label:"Self Keepsake",icon:"auto_awesome",bgClass:"bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border-yellow-500/30"}},key=String(relId).toLowerCase().replace(/[^a-z0-9_]/g,"_");return relMap[key]?relMap[key]:{label:String(relId).replace(/[_-]/g," ").replace(/\b\w/g,l=>l.toUpperCase()),icon:"favorite",bgClass:"bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30"}}function renderDashboard(){allWishes.forEach(w=>{!!(w.status==="draft"||w.isDraft||w.customData&&w.customData.isDraft)?(w.status="draft",w.lifecycleStatus="draft",w.isDraft=!0):window2.WishLifecycle&&(w.lifecycleStatus=window2.WishLifecycle.getWishStatus(w)),w.favorite=favoriteIds.has(w.id)});const totalCount=allWishes.length,draftsCount=allWishes.filter(w=>w.lifecycleStatus==="draft").length,upcomingCount=allWishes.filter(w=>w.lifecycleStatus==="upcoming").length,activeCount=allWishes.filter(w=>w.lifecycleStatus==="active").length,expiredCount=allWishes.filter(w=>w.lifecycleStatus==="expired").length,favoritesCount=allWishes.filter(w=>w.favorite).length,totalViews=allWishes.reduce((sum,w)=>sum+(w.views||0),0);updateBadge("badge-count-all",totalCount),updateBadge("badge-count-drafts",draftsCount),updateBadge("badge-count-upcoming",upcomingCount),updateBadge("badge-count-active",activeCount),updateBadge("badge-count-expired",expiredCount),updateBadge("badge-count-favorites",favoritesCount),updateStatText("stat-total-wishes",totalCount),updateStatText("stat-draft-wishes",draftsCount),updateStatText("stat-upcoming-wishes",upcomingCount),updateStatText("stat-active-wishes",activeCount),updateStatText("stat-expired-wishes",expiredCount),updateStatText("stat-total-views",totalViews);let filtered=allWishes.filter(w=>{if(currentFilter==="drafts"&&w.lifecycleStatus!=="draft"||currentFilter==="upcoming"&&w.lifecycleStatus!=="upcoming"||currentFilter==="active"&&w.lifecycleStatus!=="active"||currentFilter==="expired"&&w.lifecycleStatus!=="expired"||currentFilter==="favorites"&&!w.favorite)return!1;if(currentSearch){const query=currentSearch,cd=w.customData||{};if(![w.recipientName||"",w.buyerName||"",w.senderName||"",w.templateName||"",w.category||"",w.relationship||"",cd.recipient_name||"",cd.sender_name||"",cd.custom_message||"",cd.event_title||"",cd.relationship||""].join(" ").toLowerCase().includes(query))return!1}return!0});filtered.sort((a,b)=>{if(currentSort==="newest"){const dateA=new Date(a.createdAt||a.updatedAt||0).getTime();return new Date(b.createdAt||b.updatedAt||0).getTime()-dateA}else if(currentSort==="oldest"){const dateA=new Date(a.createdAt||a.updatedAt||0).getTime(),dateB=new Date(b.createdAt||b.updatedAt||0).getTime();return dateA-dateB}else if(currentSort==="date"){const dateA=a.eventDate||a.customData?.event_date||"9999-99-99",dateB=b.eventDate||b.customData?.event_date||"9999-99-99";return dateA.localeCompare(dateB)}else{if(currentSort==="views")return(b.views||0)-(a.views||0);{const dateA=new Date(a.updatedAt||a.createdAt||0).getTime();return new Date(b.updatedAt||b.createdAt||0).getTime()-dateA}}});const container=document.getElementById("wishes-grid-container"),emptyState=document.getElementById("wishes-empty-state"),resultCountText=document.getElementById("search-results-summary");resultCountText&&(currentSearch||currentFilter!=="all"?(resultCountText.textContent=`Showing ${filtered.length} of ${totalCount} celebration wishes`,resultCountText.classList.remove("hidden")):resultCountText.classList.add("hidden")),container&&(filtered.length===0?(container.innerHTML="",emptyState&&(emptyState.classList.remove("hidden"),customizeEmptyState(currentFilter,currentSearch))):(emptyState&&emptyState.classList.add("hidden"),container.innerHTML=filtered.map(w=>buildWishCardHTML(w)).join("")))}function updateBadge(id,count){const el=document.getElementById(id);el&&(el.textContent=count)}function updateStatText(id,val){const el=document.getElementById(id);el&&(el.textContent=val)}function customizeEmptyState(filter,search){const iconEl=document.getElementById("empty-state-icon"),titleEl=document.getElementById("empty-state-title"),descEl=document.getElementById("empty-state-desc"),ctaEl=document.getElementById("empty-state-cta");if(search){iconEl&&(iconEl.textContent="search_off"),titleEl&&(titleEl.textContent="No Matches Found"),descEl&&(descEl.textContent=`No wishes found matching "${search}". Try checking for typos or searching a different recipient name.`),ctaEl&&(ctaEl.textContent="Clear Search",ctaEl.onclick=()=>{const input=document.getElementById("search-wishes-input");input&&(input.value=""),currentSearch="",renderDashboard()});return}filter==="drafts"?(iconEl&&(iconEl.textContent="edit_note"),titleEl&&(titleEl.textContent="No Saved Drafts"),descEl&&(descEl.textContent="Start personalizing any template. Your work is safely autosaved right here."),ctaEl&&(ctaEl.textContent="+ Start a New Draft",ctaEl.onclick=()=>window2.location.href="/create.html")):filter==="upcoming"?(iconEl&&(iconEl.textContent="hourglass_top"),titleEl&&(titleEl.textContent="No Upcoming Wishes"),descEl&&(descEl.textContent="Schedule a celebration wish for upcoming birthdays or anniversaries to surprise your loved ones with a live countdown!"),ctaEl&&(ctaEl.textContent="+ Schedule Future Wish",ctaEl.onclick=()=>window2.location.href="/create.html")):filter==="active"?(iconEl&&(iconEl.textContent="celebration"),titleEl&&(titleEl.textContent="No Active Wishes Today"),descEl&&(descEl.textContent="Wishes automatically become ACTIVE on their celebration day in Asia/Kolkata timezone (IST)."),ctaEl&&(ctaEl.textContent="+ Create a Wish for Today",ctaEl.onclick=()=>window2.location.href="/create.html")):filter==="expired"?(iconEl&&(iconEl.textContent="bedtime"),titleEl&&(titleEl.textContent="No Expired Wishes"),descEl&&(descEl.textContent="Wishes expire at midnight IST after their special day ends to keep personal moments private and safe."),ctaEl&&(ctaEl.textContent="+ Create New Wish",ctaEl.onclick=()=>window2.location.href="/create.html")):filter==="favorites"?(iconEl&&(iconEl.textContent="favorite_border"),titleEl&&(titleEl.textContent="No Favorites Yet"),descEl&&(descEl.textContent="Tap the heart icon on any wish card to bookmark your most memorable celebrations."),ctaEl&&(ctaEl.textContent="Explore All Wishes",ctaEl.onclick=()=>window2.setDashboardFilter("all"))):(iconEl&&(iconEl.textContent="auto_awesome"),titleEl&&(titleEl.textContent="No Wishes Created Yet"),descEl&&(descEl.textContent="Create your very first personalized celebration experience in under 2 minutes!"),ctaEl&&(ctaEl.textContent="+ Create Your First Wish \u2728",ctaEl.onclick=()=>window2.location.href="/create.html"))}function buildWishCardHTML(w){const isDraft=w.lifecycleStatus==="draft",isUpcoming=w.lifecycleStatus==="upcoming",isActive=w.lifecycleStatus==="active",isExpired=w.lifecycleStatus==="expired",isFav=w.favorite,recipient=w.recipientName||w.customData?.recipient_name||"Special Person",sender=w.buyerName||w.senderName||w.customData?.sender_name||"Anonymous",templateName=w.templateName||"Magical Celebration",eventDate=w.eventDate||w.customData?.event_date||"",formattedDate=window2.WishLifecycle?window2.WishLifecycle.formatISTDate(eventDate):eventDate||"Special Day",isVip=window2.WishEntitlement&&typeof window2.WishEntitlement.getWishPlan=="function"?window2.WishEntitlement.getWishPlan(w)==="premium":w.tier==="vip"||w.tier==="premium"||w.price&&w.price>0,coverPhoto=w.coverPhoto||w.customData?.cover_photo||w.customData?.photos?.[0]?.src||w.customData?.photos?.[0]?.url||"https://images.unsplash.com/photo-1513151233558-d860c5398176?w=600&auto=format&fit=crop&q=80",relativeTime=getRelativeTime(w.updatedAt||w.createdAt),views=w.views||0,relInfo=getRelationshipDisplay(w);let statusBadgeHTML="";isDraft?statusBadgeHTML=`
        <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-amber-500/20 text-amber-800 dark:text-amber-200 border border-amber-500/40 shadow-sm backdrop-blur-md">
          <span class="material-symbols-outlined text-[13px]">edit_document</span>
          <span>DRAFT</span>
        </span>
      `:isActive?statusBadgeHTML=`
        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black bg-emerald-500/25 text-emerald-800 dark:text-emerald-200 border border-emerald-500/50 shadow-sm backdrop-blur-md">
          <span class="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
          <span>\u25CF ACTIVE NOW</span>
        </span>
      `:isUpcoming?statusBadgeHTML=`
        <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-indigo-500/25 text-indigo-900 dark:text-indigo-200 border border-indigo-500/45 shadow-sm backdrop-blur-md">
          <span class="material-symbols-outlined text-[13px]">schedule</span>
          <span>UPCOMING</span>
        </span>
      `:statusBadgeHTML=`
        <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-slate-600/30 text-slate-700 dark:text-slate-300 border border-slate-500/40 shadow-sm backdrop-blur-md">
          <span class="material-symbols-outlined text-[13px]">bedtime</span>
          <span>EXPIRED</span>
        </span>
      `;const tierBadgeHTML=isVip?'<span class="px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/40 backdrop-blur-md">\u{1F451} VIP PASS</span>':'<span class="px-2 py-0.5 rounded-full text-[9px] font-bold bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/20 backdrop-blur-md">FREE TIER</span>',relationshipBadgeHTML=relInfo?`
        <div class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-extrabold ${relInfo.bgClass}">
          <span class="material-symbols-outlined text-[12px] font-fill">${relInfo.icon}</span>
          <span>${relInfo.label}</span>
        </div>
      `:"";let actionButtonsHTML="";if(isDraft)actionButtonsHTML=`
        <div class="grid grid-cols-2 gap-2 pt-3 border-t border-purple-200/50 dark:border-purple-800/40">
          <a href="/customize.html?draft=${encodeURIComponent(w.id)}&template=${encodeURIComponent(w.templateId||"")}" class="col-span-2 py-2.5 px-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 hover:brightness-110 text-white font-bold text-xs shadow-md shadow-pink-500/20 flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer">
            <span class="material-symbols-outlined text-[16px]">edit</span>
            <span>Continue Editing</span>
          </a>
          <button onclick="previewWishModal('${w.id}')" class="py-2 px-2.5 rounded-xl glass-pill hover:border-purple-400 text-purple-900 dark:text-purple-200 font-semibold text-xs flex items-center justify-center gap-1 transition cursor-pointer">
            <span class="material-symbols-outlined text-[15px]">visibility</span>
            <span>Preview</span>
          </button>
          <div class="grid grid-cols-2 gap-1.5">
            <button onclick="duplicateWish('${w.id}')" class="py-2 px-1.5 rounded-xl glass-pill hover:border-purple-400 text-purple-900 dark:text-purple-200 font-semibold text-xs flex items-center justify-center gap-1 transition cursor-pointer" title="Duplicate Draft">
              <span class="material-symbols-outlined text-[14px]">content_copy</span>
              <span>Duplicate</span>
            </button>
            <button onclick="deleteWishPrompt('${w.id}')" class="py-2 px-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 font-semibold text-xs flex items-center justify-center gap-1 transition cursor-pointer" title="Delete Draft">
              <span class="material-symbols-outlined text-[14px]">delete</span>
              <span>Delete</span>
            </button>
          </div>
        </div>
      `;else if(isUpcoming)actionButtonsHTML=`
        <div class="flex flex-col gap-2 pt-3 border-t border-purple-200/50 dark:border-purple-800/40">
          <div class="grid grid-cols-2 gap-2">
            <a href="${typeof window2.getPublicWishUrl=="function"?window2.getPublicWishUrl(w):`/wish/${encodeURIComponent(w.slug||w.id)}`}" target="_blank" class="py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/20 flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer">
              <span class="material-symbols-outlined text-[16px]">hourglass_bottom</span>
              <span>Countdown</span>
            </a>
            <button onclick="openShareModal('${w.id}')" class="py-2.5 px-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 hover:brightness-110 text-white font-bold text-xs shadow-md shadow-pink-500/20 flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer">
              <span class="material-symbols-outlined text-[16px]">share</span>
              <span>Share Link</span>
            </button>
          </div>
          <div class="grid grid-cols-3 gap-1.5">
            <a href="/customize.html?edit=${encodeURIComponent(w.id)}" class="py-1.5 px-2 rounded-xl glass-pill hover:border-purple-400 text-purple-900 dark:text-purple-200 font-semibold text-[11px] flex items-center justify-center gap-1 transition cursor-pointer">
              <span class="material-symbols-outlined text-[14px]">edit</span>
              <span>Edit</span>
            </a>
            <button onclick="duplicateWish('${w.id}')" class="py-1.5 px-2 rounded-xl glass-pill hover:border-purple-400 text-purple-900 dark:text-purple-200 font-semibold text-[11px] flex items-center justify-center gap-1 transition cursor-pointer">
              <span class="material-symbols-outlined text-[14px]">content_copy</span>
              <span>Duplicate</span>
            </button>
            <button onclick="deleteWishPrompt('${w.id}')" class="py-1.5 px-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 font-semibold text-[11px] flex items-center justify-center gap-1 transition cursor-pointer">
              <span class="material-symbols-outlined text-[14px]">delete</span>
              <span>Archive</span>
            </button>
          </div>
        </div>
      `;else if(isActive)actionButtonsHTML=`
        <div class="flex flex-col gap-2 pt-3 border-t border-purple-200/50 dark:border-purple-800/40">
          <div class="grid grid-cols-2 gap-2">
            <a href="${typeof window2.getPublicWishUrl=="function"?window2.getPublicWishUrl(w):`/wish/${encodeURIComponent(w.slug||w.id)}`}" target="_blank" class="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer">
              <span class="material-symbols-outlined text-[16px]">open_in_new</span>
              <span>Open Live</span>
            </a>
            <button onclick="openShareModal('${w.id}')" class="py-2.5 px-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 hover:brightness-110 text-white font-bold text-xs shadow-md shadow-pink-500/20 flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer">
              <span class="material-symbols-outlined text-[16px]">share</span>
              <span>Share Link</span>
            </button>
          </div>
          <div class="grid grid-cols-3 gap-1.5">
            <a href="/customize.html?edit=${encodeURIComponent(w.id)}" class="py-1.5 px-2 rounded-xl glass-pill hover:border-purple-400 text-purple-900 dark:text-purple-200 font-semibold text-[11px] flex items-center justify-center gap-1 transition cursor-pointer">
              <span class="material-symbols-outlined text-[14px]">edit</span>
              <span>Edit</span>
            </a>
            <button onclick="duplicateWish('${w.id}')" class="py-1.5 px-2 rounded-xl glass-pill hover:border-purple-400 text-purple-900 dark:text-purple-200 font-semibold text-[11px] flex items-center justify-center gap-1 transition cursor-pointer">
              <span class="material-symbols-outlined text-[14px]">content_copy</span>
              <span>Duplicate</span>
            </button>
            <button onclick="deleteWishPrompt('${w.id}')" class="py-1.5 px-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 font-semibold text-[11px] flex items-center justify-center gap-1 transition cursor-pointer">
              <span class="material-symbols-outlined text-[14px]">delete</span>
              <span>Archive</span>
            </button>
          </div>
        </div>
      `;else{const publicLink=typeof window2.getPublicWishUrl=="function"?window2.getPublicWishUrl(w):`/wish/${encodeURIComponent(w.slug||w.id)}`;actionButtonsHTML=`
        <div class="flex flex-col gap-2 pt-3 border-t border-purple-200/50 dark:border-purple-800/40">
          <div class="grid grid-cols-2 gap-2">
            <button onclick="createAgainWish('${w.id}')" class="py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-500 via-pink-500 to-purple-600 hover:brightness-110 text-white font-extrabold text-xs shadow-md shadow-pink-500/20 flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer">
              <span class="material-symbols-outlined text-[16px]">restart_alt</span>
              <span>Create Again \u2728</span>
            </button>
            <a href="${publicLink}" target="_blank" class="py-2.5 px-3 rounded-xl glass-pill hover:border-purple-400 text-purple-900 dark:text-purple-200 font-semibold text-xs flex items-center justify-center gap-1 transition cursor-pointer">
              <span class="material-symbols-outlined text-[16px]">visibility</span>
              <span>View Keepsake</span>
            </a>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <button onclick="duplicateWish('${w.id}')" class="py-1.5 px-2 rounded-xl glass-pill hover:border-purple-400 text-purple-900 dark:text-purple-200 font-semibold text-[11px] flex items-center justify-center gap-1 transition cursor-pointer">
              <span class="material-symbols-outlined text-[14px]">content_copy</span>
              <span>Duplicate</span>
            </button>
            <button onclick="deleteWishPrompt('${w.id}')" class="py-1.5 px-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 font-semibold text-[11px] flex items-center justify-center gap-1 transition cursor-pointer">
              <span class="material-symbols-outlined text-[14px]">delete</span>
              <span>Archive</span>
            </button>
          </div>
        </div>
      `}return`
      <div class="glass-card rounded-3xl overflow-hidden border ${isDraft?"border-amber-500/40":isActive?"border-emerald-500/50":"border-purple-200/70 dark:border-purple-800/60"} shadow-lg hover:shadow-2xl hover:border-pink-500/50 transition-all duration-300 flex flex-col group relative" data-wish-id="${w.id}">
        <!-- Top Cover Thumbnail Banner -->
        <div class="relative h-44 w-full overflow-hidden bg-purple-950/20">
          <img src="${coverPhoto}" alt="${recipient}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" decoding="async" onerror="this.src='https://images.unsplash.com/photo-1513151233558-d860c5398176?w=600&auto=format&fit=crop&q=80'"/>
          <div class="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent"></div>

          <!-- Top-Left Badges: Status + Tier -->
          <div class="absolute top-3 left-3 flex items-center gap-1.5 flex-wrap z-10">
            ${statusBadgeHTML}
            ${tierBadgeHTML}
          </div>

          <!-- Top-Right Favorite Button -->
          <button onclick="toggleFavorite('${w.id}', event)" class="absolute top-3 right-3 p-2 rounded-full bg-black/40 backdrop-blur-md border border-white/20 text-white hover:scale-110 active:scale-95 transition z-10 cursor-pointer" title="${isFav?"Remove from favorites":"Add to favorites"}">
            <span class="material-symbols-outlined text-[18px] ${isFav?"text-pink-500 font-fill":"text-white"}">
              ${isFav?"favorite":"favorite_border"}
            </span>
          </button>

          <!-- Bottom Image Overlay: Recipient Highlight & Relationship -->
          <div class="absolute bottom-3 left-3 right-3 flex items-end justify-between text-white z-10">
            <div>
              <div class="flex items-center gap-1.5 mb-0.5">
                ${relationshipBadgeHTML}
              </div>
              <h3 class="font-display font-extrabold text-lg sm:text-xl text-white truncate max-w-[200px] sm:max-w-[240px] drop-shadow-md">
                \u2728 For ${recipient}
              </h3>
            </div>
            ${isDraft?"":`
              <div class="flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/50 backdrop-blur-md border border-white/10 text-[10px] font-bold text-purple-200">
                <span class="material-symbols-outlined text-[12px]">visibility</span>
                <span>${views} views</span>
              </div>
            `}
          </div>
        </div>

        <!-- Card Body Info -->
        <div class="p-4 sm:p-5 flex-1 flex flex-col justify-between gap-3.5">
          <div class="flex flex-col gap-2">
            <!-- Sender & Template Meta -->
            <div class="flex items-center justify-between text-xs text-purple-800 dark:text-purple-300 font-semibold">
              <span class="truncate">From: <strong class="text-purple-950 dark:text-purple-100">${sender}</strong></span>
              <span class="text-[11px] px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-900/40 text-purple-900 dark:text-purple-300 truncate max-w-[120px]">${templateName}</span>
            </div>

            <!-- Special Date Box -->
            <div class="flex items-center justify-between p-2.5 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200/70 dark:border-purple-800/50 text-xs">
              <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-pink-500 text-[18px]">event</span>
                <div>
                  <div class="text-[10px] font-bold text-purple-700 dark:text-purple-400 uppercase tracking-wider">Special Date</div>
                  <div class="font-extrabold text-purple-950 dark:text-white">${formattedDate}</div>
                </div>
              </div>
              <div class="text-[10px] text-right text-purple-600 dark:text-purple-400">
                Updated ${relativeTime}
              </div>
            </div>
          </div>

          <!-- Card Actions Footer -->
          ${actionButtonsHTML}
        </div>
      </div>
    `}function getRelativeTime(dateStr){if(!dateStr)return"recently";try{const then=new Date(dateStr).getTime(),now=Date.now(),diffSec=Math.floor((now-then)/1e3);if(diffSec<60)return"just now";const diffMin=Math.floor(diffSec/60);if(diffMin<60)return`${diffMin}m ago`;const diffHours=Math.floor(diffMin/60);if(diffHours<24)return`${diffHours}h ago`;const diffDays=Math.floor(diffHours/24);return diffDays<30?`${diffDays}d ago`:`${Math.floor(diffDays/30)}mo ago`}catch{return"recently"}}window2.duplicateWish=async function(wishId){const user=window2.WishAuth?window2.WishAuth.getCurrentUser():null;if(!user){window2.WishAuth&&window2.WishAuth.requireAuth();return}try{showDashboardToast("Duplicating celebration... \u23F3");const data=await(await fetch(`/api/wishes/${encodeURIComponent(wishId)}/duplicate`,{method:"POST",headers:getAuthHeaders(),credentials:"include"})).json();data&&data.success?(showDashboardToast("Duplicated as new Draft! \u{1F4CB}"),await fetchWishesAndDrafts(user.id),renderDashboard()):showDashboardToast(data.message||"Could not duplicate wish.")}catch(err){console.warn("[my-wishes] Duplication error:",err),window2.location.href=`/customize.html?clone=${encodeURIComponent(wishId)}`}},window2.createAgainWish=async function(wishId){if(!(window2.WishAuth?window2.WishAuth.getCurrentUser():null)){window2.WishAuth&&window2.WishAuth.requireAuth();return}try{showDashboardToast("Creating new celebration draft... \u2728");const data=await(await fetch(`/api/wishes/${encodeURIComponent(wishId)}/create-again`,{method:"POST",headers:getAuthHeaders(),credentials:"include"})).json();if(data&&data.success&&data.wishId){showDashboardToast("New celebration draft ready! \u{1F4DD}");const targetWish=allWishes.find(w=>w.id===wishId),tplId=targetWish&&targetWish.templateId||"tpl_glitter_birthday";window2.location.href=`/customize.html?draft=${encodeURIComponent(data.wishId)}&template=${encodeURIComponent(tplId)}`}else window2.location.href=`/customize.html?clone=${encodeURIComponent(wishId)}`}catch(err){console.warn("[my-wishes] Create Again API error:",err),window2.location.href=`/customize.html?clone=${encodeURIComponent(wishId)}`}},window2.deleteWishPrompt=function(wishId){const wish=allWishes.find(w=>w.id===wishId);if(!wish)return;selectedWishForAction=wish;const isDraft=wish.lifecycleStatus==="draft",recipient=wish.recipientName||"this celebration";let modal=document.getElementById("dashboard-delete-modal");modal||(modal=document.createElement("div"),modal.id="dashboard-delete-modal",modal.className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xl flex items-center justify-center p-4 transition-all duration-300",document.body.appendChild(modal)),modal.innerHTML=`
      <div class="w-full max-w-md bg-white dark:bg-purple-950 rounded-3xl border border-rose-200 dark:border-rose-900/50 shadow-2xl p-6 flex flex-col gap-4 text-center">
        <div class="w-14 h-14 rounded-full bg-rose-500/15 text-rose-500 mx-auto flex items-center justify-center text-3xl">
          <span class="material-symbols-outlined text-[32px]">delete_forever</span>
        </div>

        <div>
          <h3 class="font-display text-xl font-extrabold text-purple-950 dark:text-white">
            Delete ${isDraft?"Draft":"Keepsake"}?
          </h3>
          <p class="text-xs text-purple-700 dark:text-purple-300 mt-1">
            Are you sure you want to permanently remove the celebration for <strong class="text-purple-950 dark:text-white">${recipient}</strong>? This cannot be undone.
          </p>
        </div>

        <div class="grid grid-cols-2 gap-2 pt-2">
          <button onclick="document.getElementById('dashboard-delete-modal').classList.add('hidden')" class="py-2.5 px-4 rounded-xl glass-pill text-purple-900 dark:text-purple-200 font-bold text-xs hover:border-purple-400 transition cursor-pointer">
            Cancel
          </button>
          <button onclick="confirmDeleteWish('${wish.id}')" class="py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md shadow-rose-600/25 transition cursor-pointer">
            Yes, Delete
          </button>
        </div>
      </div>
    `,modal.classList.remove("hidden")},window2.confirmDeleteWish=async function(wishId){const modal=document.getElementById("dashboard-delete-modal");modal&&modal.classList.add("hidden");const user=window2.WishAuth?window2.WishAuth.getCurrentUser():null;try{await fetch(`/api/wishes/${encodeURIComponent(wishId)}`,{method:"DELETE",headers:getAuthHeaders(),credentials:"include"})}catch(e){console.warn("[my-wishes] Server delete call failed:",e)}favoriteIds.delete(wishId),allWishes=allWishes.filter(w=>w.id!==wishId),showDashboardToast("Celebration removed successfully \u{1F5D1}\uFE0F"),renderDashboard()},window2.previewWishModal=function(wishId){const wish=allWishes.find(w=>w.id===wishId);if(!wish)return;let modal=document.getElementById("dashboard-preview-modal");modal||(modal=document.createElement("div"),modal.id="dashboard-preview-modal",modal.className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 transition-all duration-300",document.body.appendChild(modal));const previewSrc=wish.isDraft?`/template-preview.html?template=${encodeURIComponent(wish.templateId||"tpl_glitter_birthday")}&creatorPreview=1`:`/w/${encodeURIComponent(wish.slug||wish.id)}?creatorPreview=1`;modal.innerHTML=`
      <div class="w-full max-w-4xl h-[90vh] bg-surface-container-lowest dark:bg-purple-950 rounded-3xl border border-purple-200 dark:border-purple-800 shadow-2xl flex flex-col overflow-hidden relative">
        <div class="px-5 py-3.5 bg-white dark:bg-purple-900/60 border-b border-purple-200 dark:border-purple-800 flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <span class="w-3 h-3 rounded-full bg-pink-500 animate-pulse"></span>
            <span class="font-display font-bold text-sm text-purple-950 dark:text-white">Creator Live Preview</span>
            <span class="text-xs text-purple-600 dark:text-purple-400">(${wish.recipientName||"Celebration"})</span>
          </div>
          <div class="flex items-center gap-2">
            <a href="${previewSrc}" target="_blank" class="px-3 py-1.5 rounded-xl glass-pill text-xs font-bold text-purple-900 dark:text-purple-200 hover:border-purple-400 flex items-center gap-1 transition">
              <span class="material-symbols-outlined text-[14px]">open_in_new</span>
              <span>Full Screen</span>
            </a>
            <button onclick="document.getElementById('dashboard-preview-modal').classList.add('hidden')" class="p-1.5 text-purple-400 hover:text-purple-600 dark:hover:text-white rounded-full hover:bg-purple-100 dark:hover:bg-purple-800 transition cursor-pointer">
              <span class="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>
        <div class="flex-1 w-full bg-black">
          <iframe src="${previewSrc}" class="w-full h-full border-none" title="Wish Preview"></iframe>
        </div>
      </div>
    `,modal.classList.remove("hidden")},window2.openShareModal=function(wishId){const wish=allWishes.find(w=>w.id===wishId);if(!wish)return;if(wish.isDraft||wish.lifecycleStatus==="draft"){showDashboardToast("Draft must be published before sharing a public link.");return}if(selectedWishForAction=wish,window2.WishShareSystem){window2.WishShareSystem.openShareModal(wish);return}const recipient=wish.recipientName||wish.customData?.recipient_name||"Special Person",fullLink=typeof window2.getPublicWishUrl=="function"?window2.getPublicWishUrl(wish):`${window2.location.origin}/wish/${wish.slug||wish.id}`,whatsappText=encodeURIComponent(`\u2728 Hey ${recipient}! I crafted an immersive personalized celebration website for you. Open your surprise here: ${fullLink}`);let modal=document.getElementById("dashboard-share-modal");modal||(modal=document.createElement("div"),modal.id="dashboard-share-modal",modal.className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xl flex items-center justify-center p-4 transition-all duration-300",document.body.appendChild(modal)),modal.innerHTML=`
      <div class="w-full max-w-md bg-white dark:bg-purple-950 rounded-3xl border border-purple-200 dark:border-purple-800 shadow-2xl p-6 sm:p-7 flex flex-col gap-4 relative animate-scaleUp">
        <button onclick="document.getElementById('dashboard-share-modal').classList.add('hidden')" class="absolute top-4 right-4 p-2 text-purple-400 hover:text-purple-600 dark:hover:text-white rounded-full hover:bg-purple-100 dark:hover:bg-purple-900/60 transition cursor-pointer">
          <span class="material-symbols-outlined text-[20px]">close</span>
        </button>

        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-pink-500 to-purple-600 text-white flex items-center justify-center text-2xl shadow-lg shadow-pink-500/25">
            \u{1F381}
          </div>
          <div>
            <h3 class="font-display text-xl font-extrabold text-purple-950 dark:text-white">Share Celebration Link</h3>
            <p class="text-xs text-purple-700 dark:text-purple-300">Personalized for <strong class="text-pink-500">${recipient}</strong></p>
          </div>
        </div>

        <!-- Direct Link Box -->
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-bold text-purple-900 dark:text-purple-200">Public Keepsake Link</label>
          <div class="flex items-center justify-between gap-2 p-1.5 pl-3.5 rounded-2xl bg-purple-100 dark:bg-purple-900/50 border border-purple-300 dark:border-purple-700">
            <input id="share-link-input-modal" type="text" readonly value="${fullLink}" class="w-full bg-transparent text-xs font-mono text-purple-950 dark:text-purple-200 focus:outline-none select-all truncate"/>
            <button onclick="copyShareModalLink()" id="btn-copy-share-modal" class="px-3.5 py-2 rounded-xl bg-purple-700 hover:bg-purple-600 text-white text-xs font-bold shadow flex items-center gap-1 flex-shrink-0 transition cursor-pointer">
              <span class="material-symbols-outlined text-[15px]">content_copy</span>
              <span id="btn-copy-share-text">Copy</span>
            </button>
          </div>
        </div>

        <!-- Social Share CTAs -->
        <div class="grid grid-cols-2 gap-2 pt-2">
          <a href="https://api.whatsapp.com/send?text=${whatsappText}" target="_blank" class="py-3 px-3 rounded-2xl bg-[#25D366] hover:brightness-105 text-white font-bold text-xs shadow-md flex items-center justify-center gap-2 transition active:scale-95">
            <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.006c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.26.304c-.087.086-.177.18-.076.354.101.174.449.741.964 1.201.662.591 1.221.774 1.394.86s.275.072.376-.044c.101-.116.433-.506.549-.68.116-.173.231-.145.39-.087s1.011.477 1.184.564.289.13.332.202c.045.072.045.419-.1.824z"/></svg>
            <span>WhatsApp</span>
          </a>
          <a href="${fullLink}" target="_blank" class="py-3 px-3 rounded-2xl bg-purple-100 dark:bg-purple-900/60 hover:bg-purple-200 dark:hover:bg-purple-800 text-purple-950 dark:text-white font-bold text-xs border border-purple-300 dark:border-purple-700 flex items-center justify-center gap-1.5 transition">
            <span class="material-symbols-outlined text-[16px]">open_in_new</span>
            <span>Open Link</span>
          </a>
        </div>
      </div>
    `,modal.classList.remove("hidden")},window2.copyShareModalLink=async function(){const input=document.getElementById("share-link-input-modal"),btnText=document.getElementById("btn-copy-share-text");if(!input||!input.value.trim()){showDashboardToast("\u26A0\uFE0F No celebration link available.");return}const url=input.value.trim();btnText&&(btnText.textContent="Copying...");let copied=!1;if(navigator.clipboard&&window2.isSecureContext)try{await navigator.clipboard.writeText(url),copied=!0}catch{copied=!1}if(!copied)try{input.focus(),input.select(),input.setSelectionRange(0,99999),copied=document.execCommand("copy")}catch{copied=!1}copied?(btnText&&(btnText.textContent="Copied! \u2728"),showDashboardToast("Link copied to clipboard! \u{1F4CB}")):(btnText&&(btnText.textContent="Copy Failed"),showDashboardToast("\u26A0\uFE0F Could not copy automatically. Please copy manually."),input.focus(),input.select()),setTimeout(()=>{btnText&&(btnText.textContent="Copy")},2500)};function showDashboardToast(msg){let toast=document.getElementById("dashboard-toast");toast||(toast=document.createElement("div"),toast.id="dashboard-toast",toast.className="fixed top-6 right-6 z-50 transform translate-y-[-150%] opacity-0 transition-all duration-300 pointer-events-none px-4 py-2.5 rounded-2xl bg-purple-950/95 text-white text-xs font-bold shadow-2xl border border-purple-700/60 flex items-center gap-2",document.body.appendChild(toast)),toast.textContent=msg,toast.classList.remove("translate-y-[-150%]","opacity-0"),toast.classList.add("translate-y-0","opacity-100"),setTimeout(()=>{toast.classList.remove("translate-y-0","opacity-100"),toast.classList.add("translate-y-[-150%]","opacity-0")},2800)}})(window);
