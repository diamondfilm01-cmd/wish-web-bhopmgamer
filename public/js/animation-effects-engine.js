(function(window2){"use strict";const WishEffectRegistry={ENTRANCE_PRESETS:{none:{id:"none",label:"None",description:"Instant appearance without entrance transition"},fade:{id:"fade",label:"Fade In",description:"Smooth soft opacity fade-in"},"fade-up":{id:"fade-up",label:"Fade Up",description:"Gentle upward glide with opacity"},"fade-down":{id:"fade-down",label:"Fade Down",description:"Soft downward cascade"},"soft-scale":{id:"soft-scale",label:"Soft Scale",description:"Elegant expansion from 95% scale"},"blur-reveal":{id:"blur-reveal",label:"Blur Reveal",description:"Dreamy focus transition from frosted blur"},"cinematic-reveal":{id:"cinematic-reveal",label:"Cinematic Reveal",description:"Dramatic luxury curtain-style reveal"},magical:{id:"magical",label:"Magical Shimmer",description:"Enchanted glow sparkle entrance"}},SECTION_TRANSITIONS:{none:{id:"none",label:"None",cssClass:"reveal-none"},fade:{id:"fade",label:"Soft Fade",cssClass:"reveal-fade"},slide:{id:"slide",label:"Slide Up",cssClass:"reveal-slide"},"soft-scale":{id:"soft-scale",label:"Soft Scale",cssClass:"reveal-scale"},cinematic:{id:"cinematic",label:"Cinematic Pan",cssClass:"reveal-cinematic"},dissolve:{id:"dissolve",label:"Dissolve Glow",cssClass:"reveal-dissolve"}},TEXT_REVEALS:{none:{id:"none",label:"Instant Text",description:"Standard instant rendering"},fade:{id:"fade",label:"Fade Reveal",description:"Gentle letter opacity fade"},typewriter:{id:"typewriter",label:"Typewriter Flow",description:"Realistic typing cadence with cursor"},"word-reveal":{id:"word-reveal",label:"Word by Word",description:"Staggered rhythmic word appearance"},"soft-glow":{id:"soft-glow",label:"Soft Halo Glow",description:"Luminescent aura breathing highlight"},"handwritten-reveal":{id:"handwritten-reveal",label:"Handwritten Flow",description:"Romantic script ink flourish reveal"}},IMAGE_REVEALS:{none:{id:"none",label:"None",cssClass:"img-reveal-none"},fade:{id:"fade",label:"Soft Fade",cssClass:"img-reveal-fade"},zoom:{id:"zoom",label:"Slow Ken-Burns Zoom",cssClass:"img-reveal-zoom"},"soft-zoom":{id:"soft-zoom",label:"Soft Pop Expansion",cssClass:"img-reveal-soft-zoom"},"polaroid-pop":{id:"polaroid-pop",label:"Polaroid Tilt Pop",cssClass:"img-reveal-polaroid"},"blur-to-clear":{id:"blur-to-clear",label:"Frosted Focus",cssClass:"img-reveal-blur"}},PARTICLE_TYPES:{none:{id:"none",label:"None / Clean",icon:"\u{1F6AB}"},sparkles:{id:"sparkles",label:"Sparkles",icon:"\u2728"},stars:{id:"stars",label:"Twinkling Stars",icon:"\u{1F31F}"},hearts:{id:"hearts",label:"Floating Hearts",icon:"\u{1F496}"},petals:{id:"petals",label:"Rose Petals",icon:"\u{1F338}"},dots:{id:"dots",label:"Starlight Bokeh",icon:"\u{1F4AB}"},confetti:{id:"confetti",label:"Confetti Flutter",icon:"\u{1F389}"}},INTENSITIES:{minimal:{id:"minimal",label:"Minimal",particleCountDesktop:14,particleCountMobile:7,transitionDurationMs:400,enableGlow:!1,enableInteractiveBursts:!1},soft:{id:"soft",label:"Soft & Elegant",particleCountDesktop:30,particleCountMobile:15,transitionDurationMs:700,enableGlow:!0,enableInteractiveBursts:!0},expressive:{id:"expressive",label:"Expressive Magic",particleCountDesktop:55,particleCountMobile:26,transitionDurationMs:1e3,enableGlow:!0,enableInteractiveBursts:!0}}},WishParticleEngine={canvas:null,ctx:null,animFrameId:null,particles:[],burstParticles:[],currentConfig:{type:"sparkles",intensity:"soft",primaryColor:"#ec4899",accentColor:"#fbbf24",secondaryColor:"#8b5cf6",interactiveBursts:!0},isMobile:!1,prefersReducedMotion:!1,init(targetDoc,config={}){const doc=targetDoc||window2.document,win=doc.defaultView||window2;if(this.prefersReducedMotion=win.matchMedia&&win.matchMedia("(prefers-reduced-motion: reduce)").matches,this.isMobile=(win.innerWidth||doc.documentElement.clientWidth||800)<768,this.prefersReducedMotion){this.destroy(doc);return}if(this.updateConfig(config),this.currentConfig.type==="none"||this.currentConfig.intensity==="off"){this.destroy(doc);return}let canvas=doc.getElementById("wishmagic-particle-canvas");canvas||(canvas=doc.createElement("canvas"),canvas.id="wishmagic-particle-canvas",canvas.className="fixed inset-0 pointer-events-none z-0",canvas.style.position="fixed",canvas.style.top="0",canvas.style.left="0",canvas.style.width="100%",canvas.style.height="100%",canvas.style.pointerEvents="none",canvas.style.zIndex="1",canvas.style.willChange="transform, opacity",doc.body.insertBefore(canvas,doc.body.firstChild)),this.canvas=canvas,this.ctx=canvas.getContext("2d",{alpha:!0});const resizeHandler=()=>{this.canvas&&(this.isMobile=(win.innerWidth||doc.documentElement.clientWidth||800)<768,this.canvas.width=win.innerWidth||doc.documentElement.clientWidth||800,this.canvas.height=win.innerHeight||doc.documentElement.clientHeight||600)};resizeHandler(),win.removeEventListener("resize",canvas._wmResizeHandler),canvas._wmResizeHandler=resizeHandler,win.addEventListener("resize",resizeHandler,{passive:!0}),this.spawnAmbientParticles(),this.startLoop(),this.currentConfig.interactiveBursts&&this.bindInteractiveClicks(doc,win)},updateConfig(newConfig={}){this.currentConfig=Object.assign({},this.currentConfig,newConfig)},spawnAmbientParticles(){if(!this.canvas)return;const intensityKey=this.currentConfig.intensity||"soft",intensityMeta=WishEffectRegistry.INTENSITIES[intensityKey]||WishEffectRegistry.INTENSITIES.soft,targetCount=this.isMobile?intensityMeta.particleCountMobile:intensityMeta.particleCountDesktop;this.particles=[];const type=this.currentConfig.type||"sparkles",w=this.canvas.width,h=this.canvas.height;for(let i=0;i<targetCount;i++)this.particles.push(this.createParticle(type,w,h,!1))},createParticle(type,w,h,isNew=!1){const pColor=this.currentConfig.primaryColor||"#ec4899",aColor=this.currentConfig.accentColor||"#fbbf24",sColor=this.currentConfig.secondaryColor||"#8b5cf6",colors=[pColor,aColor,sColor,"#ffffff"],sizeBase=type==="hearts"?6:type==="petals"?8:type==="confetti"?5:3;return{x:Math.random()*w,y:isNew?h+10:Math.random()*h,size:Math.random()*sizeBase+sizeBase*.6,speedY:(Math.random()*.45+.2)*(type==="petals"?1.2:-1),speedX:(Math.random()-.5)*.4,rotation:Math.random()*Math.PI*2,rotSpeed:(Math.random()-.5)*.03,alpha:Math.random()*.6+.25,alphaTarget:Math.random()*.8+.2,alphaPulse:(Math.random()*.015+.005)*(Math.random()>.5?1:-1),wobble:Math.random()*Math.PI*2,wobbleSpeed:Math.random()*.03+.01,color:colors[Math.floor(Math.random()*colors.length)],type}},bindInteractiveClicks(doc,win){doc._wmBurstListener&&doc.removeEventListener("pointerdown",doc._wmBurstListener);const burstListener=e=>{if(e.target&&e.target.closest("button, input, textarea, a, select")&&!e.target.closest(".interactive-magic-target"))return;const rect=this.canvas?this.canvas.getBoundingClientRect():{left:0,top:0},x=e.clientX-rect.left,y=e.clientY-rect.top;this.triggerBurst(x,y,this.currentConfig.type==="hearts"?"hearts":"sparkles",10)};doc._wmBurstListener=burstListener,doc.addEventListener("pointerdown",burstListener,{passive:!0})},triggerBurst(x,y,burstType="sparkles",count=12){if(this.prefersReducedMotion||!this.canvas)return;const effectiveCount=this.isMobile?Math.floor(count*.6):count,pColor=this.currentConfig.primaryColor||"#ec4899",aColor=this.currentConfig.accentColor||"#fbbf24";for(let i=0;i<effectiveCount;i++){const angle=Math.PI*2*i/effectiveCount+(Math.random()-.5)*.5,speed=Math.random()*3.5+1.5;this.burstParticles.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed-1.2,size:Math.random()*5+3,rotation:Math.random()*Math.PI*2,rotSpeed:(Math.random()-.5)*.1,alpha:1,decay:Math.random()*.025+.02,color:Math.random()>.5?pColor:aColor,type:burstType})}},startLoop(){this.animFrameId&&cancelAnimationFrame(this.animFrameId);const render=()=>{if(!this.canvas||!this.ctx)return;const ctx=this.ctx,w=this.canvas.width,h=this.canvas.height;ctx.clearRect(0,0,w,h);for(let i=0;i<this.particles.length;i++){const p=this.particles[i];p.wobble+=p.wobbleSpeed,p.x+=p.speedX+Math.sin(p.wobble)*.3,p.y+=p.speedY,p.rotation+=p.rotSpeed,p.alpha+=p.alphaPulse,(p.alpha>.85||p.alpha<.15)&&(p.alphaPulse=-p.alphaPulse),p.y<-20&&p.speedY<0?(p.y=h+10,p.x=Math.random()*w):p.y>h+20&&p.speedY>0&&(p.y=-10,p.x=Math.random()*w),p.x<-20&&(p.x=w+10),p.x>w+20&&(p.x=-10),this.drawParticle(ctx,p)}for(let i=this.burstParticles.length-1;i>=0;i--){const bp=this.burstParticles[i];if(bp.x+=bp.vx,bp.y+=bp.vy,bp.vy+=.08,bp.vx*=.98,bp.rotation+=bp.rotSpeed,bp.alpha-=bp.decay,bp.alpha<=0){this.burstParticles.splice(i,1);continue}this.drawParticle(ctx,bp)}this.animFrameId=requestAnimationFrame(render)};this.animFrameId=requestAnimationFrame(render)},drawParticle(ctx,p){ctx.save(),ctx.globalAlpha=Math.max(0,Math.min(1,p.alpha)),ctx.translate(p.x,p.y),ctx.rotate(p.rotation||0);const type=p.type||"sparkles",s=p.size;if(type==="hearts"){ctx.fillStyle=p.color,ctx.beginPath();const topCurveHeight=s*.3;ctx.moveTo(0,topCurveHeight),ctx.bezierCurveTo(0,0,-s/2,0,-s/2,topCurveHeight),ctx.bezierCurveTo(-s/2,(s+topCurveHeight)/2,0,(s+topCurveHeight)/1.5,0,s),ctx.bezierCurveTo(0,(s+topCurveHeight)/1.5,s/2,(s+topCurveHeight)/2,s/2,topCurveHeight),ctx.bezierCurveTo(s/2,0,0,0,0,topCurveHeight),ctx.closePath(),ctx.fill()}else if(type==="stars"){ctx.fillStyle=p.color,ctx.beginPath();const spikes=5,outerRadius=s,innerRadius=s*.45;let rot=Math.PI/2*3,x=0,y=0;const step=Math.PI/spikes;ctx.moveTo(0,-outerRadius);for(let i=0;i<spikes;i++)x=Math.cos(rot)*outerRadius,y=Math.sin(rot)*outerRadius,ctx.lineTo(x,y),rot+=step,x=Math.cos(rot)*innerRadius,y=Math.sin(rot)*innerRadius,ctx.lineTo(x,y),rot+=step;ctx.lineTo(0,-outerRadius),ctx.closePath(),ctx.fill()}else type==="petals"?(ctx.fillStyle=p.color,ctx.beginPath(),ctx.ellipse(0,0,s*.6,s,Math.PI/4,0,Math.PI*2),ctx.fill()):type==="confetti"?(ctx.fillStyle=p.color,ctx.fillRect(-s/2,-s/3,s,s*.66)):type==="dots"?(ctx.fillStyle=p.color,ctx.beginPath(),ctx.arc(0,0,s*.7,0,Math.PI*2),ctx.fill()):(ctx.fillStyle=p.color,ctx.beginPath(),ctx.moveTo(0,-s),ctx.quadraticCurveTo(0,0,s,0),ctx.quadraticCurveTo(0,0,0,s),ctx.quadraticCurveTo(0,0,-s,0),ctx.quadraticCurveTo(0,0,0,-s),ctx.closePath(),ctx.fill());ctx.restore()},destroy(doc){this.animFrameId&&(cancelAnimationFrame(this.animFrameId),this.animFrameId=null),this.particles=[],this.burstParticles=[];const canvas=(doc||window2.document).getElementById("wishmagic-particle-canvas");canvas&&canvas.parentNode&&canvas.parentNode.removeChild(canvas),this.canvas=null,this.ctx=null}},WishAnimationEngine={injectedStylesDoc:null,observer:null,init(targetDoc,animConfig={}){const doc=targetDoc||window2.document;this.injectAnimationCSS(doc),this.setupScrollObserver(doc,animConfig),this.applyPageEntrance(doc,animConfig),this.initTextReveals(doc,animConfig),this.initImageReveals(doc,animConfig),WishParticleEngine.init(doc,{type:animConfig.particleType||"sparkles",intensity:animConfig.intensity||"soft",primaryColor:animConfig.primaryColor||"#ec4899",accentColor:animConfig.accentColor||"#fbbf24",secondaryColor:animConfig.secondaryColor||"#8b5cf6",interactiveBursts:animConfig.interactiveBursts!==!1})},injectAnimationCSS(doc){if(!doc||doc.getElementById("wishmagic-animations-styles"))return;const style=doc.createElement("style");style.id="wishmagic-animations-styles",style.textContent=`
        /* -------------------------------------------------------------
           Part 13: Core GPU-Accelerated Animation Styles
           ------------------------------------------------------------- */
        
        /* Entrance Animations */
        .wm-entrance-fade {
          animation: wmFadeIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
        }
        .wm-entrance-fade-up {
          animation: wmFadeUp 0.85s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
        }
        .wm-entrance-soft-scale {
          animation: wmSoftScale 0.9s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
        }
        .wm-entrance-blur-reveal {
          animation: wmBlurReveal 1s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
        }
        .wm-entrance-cinematic {
          animation: wmCinematic 1.1s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
        }
        .wm-entrance-magical {
          animation: wmMagical 1s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
        }

        /* Scroll Reveal Initial and Visible States */
        .wm-reveal-target {
          opacity: 0;
          will-change: transform, opacity;
          transition-property: transform, opacity, filter;
          transition-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
        }

        .wm-reveal-fade {
          transform: translateY(0);
          transition-duration: 0.7s;
        }
        .wm-reveal-slide {
          transform: translateY(32px);
          transition-duration: 0.8s;
        }
        .wm-reveal-scale {
          transform: scale(0.94);
          transition-duration: 0.75s;
        }
        .wm-reveal-cinematic {
          transform: translateY(40px) scale(0.96);
          transition-duration: 0.95s;
        }
        .wm-reveal-dissolve {
          filter: blur(8px);
          transform: scale(0.98);
          transition-duration: 0.85s;
        }

        .wm-reveal-target.wm-revealed {
          opacity: 1 !important;
          transform: translateY(0) scale(1) !important;
          filter: blur(0px) !important;
        }

        /* Image Reveal Classes */
        .wm-img-fade {
          opacity: 0;
          transition: opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .wm-img-zoom {
          transform: scale(1.06);
          transition: transform 1.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.8s ease;
        }
        .wm-img-polaroid {
          transform: rotate(-3deg) scale(0.95);
          transition: transform 0.8s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.6s ease;
        }
        .wm-img-polaroid:hover {
          transform: rotate(0deg) scale(1.02);
        }
        .wm-img-blur {
          filter: blur(10px);
          transition: filter 0.9s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.8s ease;
        }

        .wm-revealed .wm-img-fade, .wm-img-fade.wm-revealed {
          opacity: 1 !important;
        }
        .wm-revealed .wm-img-zoom, .wm-img-zoom.wm-revealed {
          transform: scale(1) !important;
        }
        .wm-revealed .wm-img-blur, .wm-img-blur.wm-revealed {
          filter: blur(0) !important;
        }

        /* Typewriter Cursor */
        .wm-typewriter-cursor::after {
          content: '|';
          animation: wmBlink 0.9s infinite;
          margin-left: 2px;
          color: var(--wish-accent, #fbbf24);
        }

        /* Keyframe Definitions */
        @keyframes wmFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes wmFadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes wmSoftScale {
          from { opacity: 0; transform: scale(0.93); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes wmBlurReveal {
          from { opacity: 0; filter: blur(12px); transform: scale(0.98); }
          to { opacity: 1; filter: blur(0); transform: scale(1); }
        }
        @keyframes wmCinematic {
          from { opacity: 0; transform: translateY(35px) scale(0.95); filter: contrast(1.1); }
          to { opacity: 1; transform: translateY(0) scale(1); filter: contrast(1); }
        }
        @keyframes wmMagical {
          0% { opacity: 0; transform: scale(0.92); filter: drop-shadow(0 0 0 rgba(236, 72, 153, 0)); }
          50% { filter: drop-shadow(0 0 15px rgba(236, 72, 153, 0.45)); }
          100% { opacity: 1; transform: scale(1); filter: drop-shadow(0 0 0 rgba(236, 72, 153, 0)); }
        }
        @keyframes wmBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }

        /* Reduced Motion Media Override */
        @media (prefers-reduced-motion: reduce) {
          .wm-entrance-fade, .wm-entrance-fade-up, .wm-entrance-soft-scale,
          .wm-entrance-blur-reveal, .wm-entrance-cinematic, .wm-entrance-magical,
          .wm-reveal-target {
            animation: none !important;
            transition: none !important;
            opacity: 1 !important;
            transform: none !important;
            filter: none !important;
          }
        }
      `,doc.head.appendChild(style)},applyPageEntrance(doc,animConfig={}){const entrance=animConfig.entrance||"fade-up";if(entrance==="none")return;const mainContainer=doc.getElementById("wish-container")||doc.querySelector("main")||doc.body;if(!mainContainer)return;mainContainer.classList.remove("wm-entrance-fade","wm-entrance-fade-up","wm-entrance-soft-scale","wm-entrance-blur-reveal","wm-entrance-cinematic","wm-entrance-magical");const cls={fade:"wm-entrance-fade","fade-up":"wm-entrance-fade-up","fade-down":"wm-entrance-fade-up","soft-scale":"wm-entrance-soft-scale","blur-reveal":"wm-entrance-blur-reveal",cinematic:"wm-entrance-cinematic","cinematic-reveal":"wm-entrance-cinematic",magical:"wm-entrance-magical"}[entrance]||"wm-entrance-fade-up";mainContainer.classList.add(cls)},setupScrollObserver(doc,animConfig={}){this.observer&&this.observer.disconnect();const win=doc.defaultView||window2;if(win.matchMedia&&win.matchMedia("(prefers-reduced-motion: reduce)").matches){doc.querySelectorAll("section, .wish-section-animate, .wm-reveal-target").forEach(el=>el.classList.add("wm-revealed"));return}const transitionType=animConfig.sectionTransition||"slide";if(transitionType==="none"){doc.querySelectorAll("section, .wish-section-animate, .wm-reveal-target").forEach(el=>el.classList.add("wm-revealed"));return}const transitionCls="wm-reveal-"+(transitionType==="cinematic"?"cinematic":transitionType==="soft-scale"?"scale":transitionType==="dissolve"?"dissolve":transitionType==="fade"?"fade":"slide"),targets=doc.querySelectorAll("section, [data-wm-section], .wish-story-card");targets.forEach(el=>{el.classList.add("wm-reveal-target",transitionCls)}),this.observer=new IntersectionObserver((entries,obs)=>{entries.forEach(entry=>{entry.isIntersecting&&(entry.target.classList.add("wm-revealed"),entry.target.querySelectorAll(".stagger-item, .gallery-item, .polaroid-card").forEach((sub,idx)=>{setTimeout(()=>{sub.classList.add("wm-revealed")},idx*90)}),obs.unobserve(entry.target))})},{root:null,rootMargin:"0px 0px -40px 0px",threshold:.1}),targets.forEach(el=>this.observer.observe(el))},initTextReveals(doc,animConfig={}){const textAnim=animConfig.textReveal||"fade";textAnim!=="none"&&textAnim==="typewriter"&&doc.querySelectorAll(".wish-typewriter-target, [data-wm-typewriter]").forEach(el=>{const fullText=el.getAttribute("data-full-text")||el.textContent.trim();el.setAttribute("data-full-text",fullText),el.textContent="",el.classList.add("wm-typewriter-cursor");let charIdx=0;const typeInterval=setInterval(()=>{charIdx<fullText.length?(el.textContent+=fullText.charAt(charIdx),charIdx++):(clearInterval(typeInterval),setTimeout(()=>{el.classList.remove("wm-typewriter-cursor")},2500))},35)})},initImageReveals(doc,animConfig={}){const imgAnim=animConfig.imageReveal||"fade";if(imgAnim==="none")return;const cls={fade:"wm-img-fade",zoom:"wm-img-zoom","soft-zoom":"wm-img-zoom","polaroid-pop":"wm-img-polaroid","blur-to-clear":"wm-img-blur"}[imgAnim]||"wm-img-fade";doc.querySelectorAll("img.wish-photo-item, .polaroid-card, .gallery-item img").forEach(img=>{img.classList.add(cls)})}};window2.WishEffectRegistry=WishEffectRegistry,window2.WishParticleEngine=WishParticleEngine,window2.WishAnimationEngine=WishAnimationEngine})(typeof window<"u"?window:this);
