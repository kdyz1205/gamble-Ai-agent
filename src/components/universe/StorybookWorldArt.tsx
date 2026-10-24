/** Original SVG world-building artwork. Decorative only: no invented live world or users. */
export function StorybookPortalArt() {
  return <svg className="sum-storybook-portal-art" viewBox="0 0 700 610" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="storybook-sky" x1="0" y1="0" x2=".9" y2="1">
        <stop stopColor="#d8ecfb"/><stop offset=".48" stopColor="#f4e4fc"/><stop offset="1" stopColor="#fff2db"/>
      </linearGradient>
      <radialGradient id="storybook-glow">
        <stop stopColor="#fffdf2" stopOpacity=".98"/><stop offset=".45" stopColor="#e9dcfc" stopOpacity=".75"/><stop offset="1" stopColor="#e9e8fb" stopOpacity="0"/>
      </radialGradient>
      <linearGradient id="storybook-gate" x1=".12" y1="0" x2=".91" y2="1">
        <stop stopColor="#fffefa"/><stop offset=".22" stopColor="#ffe5c8"/><stop offset=".45" stopColor="#d4c3ef"/><stop offset=".68" stopColor="#fff7e7"/><stop offset="1" stopColor="#b6d9cf"/>
      </linearGradient>
      <linearGradient id="storybook-inner" x1=".15" y1=".1" x2=".8" y2="1">
        <stop stopColor="#bfeaff"/><stop offset=".47" stopColor="#e9d8fb"/><stop offset="1" stopColor="#fff2df"/>
      </linearGradient>
      <linearGradient id="storybook-island" x1="0" y1="0" x2=".5" y2="1">
        <stop stopColor="#d8d6d3"/><stop offset=".55" stopColor="#aaa5b0"/><stop offset="1" stopColor="#877f91"/>
      </linearGradient>
      <linearGradient id="storybook-grass" x1="0" y1="0" x2=".9" y2="1">
        <stop stopColor="#d9f3cc"/><stop offset=".45" stopColor="#9ed6ae"/><stop offset="1" stopColor="#6fac94"/>
      </linearGradient>
      <filter id="storybook-shadow" x="-40%" y="-40%" width="180%" height="200%">
        <feGaussianBlur stdDeviation="13"/>
      </filter>
      <filter id="storybook-soft" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="4"/>
      </filter>
    </defs>
    <rect width="700" height="610" fill="url(#storybook-sky)" opacity=".14"/>
    <circle cx="372" cy="245" r="255" fill="url(#storybook-glow)"/>
    <g fill="#fffefa" opacity=".86">
      <ellipse cx="103" cy="201" rx="82" ry="21"/><ellipse cx="78" cy="188" rx="41" ry="24"/><ellipse cx="148" cy="188" rx="52" ry="27"/>
      <ellipse cx="623" cy="157" rx="100" ry="22"/><ellipse cx="590" cy="143" rx="42" ry="25"/><ellipse cx="675" cy="145" rx="52" ry="20"/>
      <ellipse cx="626" cy="371" rx="91" ry="18"/><ellipse cx="96" cy="363" rx="106" ry="26"/>
    </g>
    <g fill="#c9c3e9" opacity=".6">
      <path d="M70 311v-47l16-25 16 25v47Z"/><rect x="57" y="285" width="59" height="28" rx="2"/>
      <path d="M122 314v-26l11-21 12 21v26Z"/><path d="M570 314v-78l17-29 19 29v78Z"/><rect x="553" y="274" width="77" height="39" rx="3"/>
      <path d="M613 314v-38l14-23 15 23v38Z"/>
    </g>
    <g opacity=".45" fill="#a9d5bb">
      <path d="M15 405c86-69 129-65 204-31v52H15Z"/>
      <path d="M480 401c71-61 155-56 220-18v53H480Z"/>
    </g>
    <ellipse cx="358" cy="511" rx="270" ry="48" fill="#688e90" opacity=".23" filter="url(#storybook-shadow)"/>
    <g>
      <path d="M216 440V205c0-92 63-157 152-157s152 65 152 157v235" fill="none" stroke="#d7bbd7" strokeWidth="78" strokeLinecap="round" opacity=".45"/>
      <path d="M215 440V205c0-92 63-157 152-157s152 65 152 157v235" fill="none" stroke="url(#storybook-gate)" strokeWidth="65" strokeLinecap="round"/>
      <path d="M215 440V205c0-92 63-157 152-157s152 65 152 157v235" fill="none" stroke="#fffdf4" strokeWidth="10" strokeLinecap="round" opacity=".8"/>
      <path d="M246 430V205c0-73 50-126 121-126s121 53 121 126v225Z" fill="url(#storybook-inner)" stroke="#b7c8de" strokeWidth="5"/>
      <path d="M260 385c40-48 75-74 111-64 33 6 66 21 103 64v45H260Z" fill="#cce4d8" opacity=".75"/>
      <path d="M260 415c62-45 142-48 214-2v18H260Z" fill="#98cab4" opacity=".8"/>
      <ellipse cx="367" cy="208" rx="110" ry="165" fill="#fff" opacity=".13"/>
      <path d="M248 203c8-90 52-126 117-130" stroke="#fff" strokeWidth="5" opacity=".6" strokeLinecap="round"/>
      <path d="M294 333h140" stroke="#e7d8ff" strokeWidth="3" opacity=".7"/>
      <path d="M319 326V247l19-26 20 26v79Z" fill="#ddcef2" opacity=".65"/>
      <path d="M350 326V219l21-33 22 33v107Z" fill="#fdf2e6" opacity=".65"/>
      <path d="M386 326V268l17-23 18 23v58Z" fill="#d6cdeb" opacity=".65"/>
      <path d="M206 440V217m322 223V217" stroke="#b9b5d8" strokeWidth="4" opacity=".7"/>
      <circle cx="218" cy="255" r="9" fill="#fffcef" stroke="#eac89e" strokeWidth="4"/>
      <circle cx="519" cy="255" r="9" fill="#fffcef" stroke="#eac89e" strokeWidth="4"/>
      <path d="m367 27 23 30-23 35-23-35 23-30Z" fill="#ffece0" stroke="#e9c5d8" strokeWidth="6"/>
      <path d="m367 35 15 22-15 25-15-25 15-22Z" fill="#d5c6f7"/>
      <path d="M367 44v27" stroke="#fff" strokeWidth="4" strokeLinecap="round"/>
    </g>
    <g>
      <path d="M99 465c99-28 417-25 521 0 3 24-21 62-70 70-38 30-97 49-169 53-83-4-142-27-181-57-57-9-96-34-101-66Z" fill="url(#storybook-island)" stroke="#a49ca1" strokeWidth="2"/>
      <path d="M121 481c110 25 389 25 485-1-19 25-56 43-110 54-98 19-225 18-302-10-31-12-57-27-73-43Z" fill="#ada6ad" opacity=".55"/>
      <path d="M83 456c11-39 103-47 279-44 174-4 257 12 267 44-3 29-144 51-274 50S85 488 83 456Z" fill="url(#storybook-grass)" stroke="#7eb397" strokeWidth="3"/>
      <ellipse cx="356" cy="443" rx="244" ry="29" fill="#eaf8d9" opacity=".56"/>
      <ellipse cx="356" cy="477" rx="237" ry="24" fill="#80c5a0" opacity=".25"/>
      <path d="M156 492c20 15 31 43 39 51m44-38c7 21 9 35 2 51m264-52c-12 21-15 30-13 53m58-64c-22 19-29 32-30 37" stroke="#8aa79b" strokeWidth="7" strokeLinecap="round" opacity=".6"/>
    </g>
    <g>
      {[[115,445],[142,473],[575,441],[596,467],[190,456],[524,466]].map(([x,y],i) =>
        <g key={i} transform={`translate(${x} ${y}) scale(${i%2? .8:1})`}>
          <path d="M0 0q-8-14-10-28M0 0q7-15 16-21" stroke="#5caa88" strokeWidth="3" fill="none"/>
          <ellipse cx="-8" cy="-17" rx="8" ry="4" transform="rotate(-35 -8 -17)" fill="#8dcba6"/>
          <ellipse cx="10" cy="-19" rx="8" ry="4" transform="rotate(35 10 -19)" fill="#9edbb4"/>
          <circle cy="-29" r="7" fill={i%2?"#f3c6df":"#fff2da"}/>
          <circle cy="-29" r="3.3" fill="#f6cd88"/>
        </g>)}
      <g fill="#ffe2ad" opacity=".9">
        <path d="m136 255 5 11 11 5-11 5-5 11-5-11-11-5 11-5 5-11Z"/>
        <path d="m590 288 4 9 9 4-9 4-4 9-4-9-9-4 9-4 4-9Z"/>
        <path d="m492 101 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z"/>
      </g>
      <g fill="#fff9dd" opacity=".85">
        <circle cx="156" cy="179" r="3"/><circle cx="539" cy="195" r="4"/><circle cx="620" cy="232" r="2.6"/>
        <circle cx="107" cy="341" r="3.5"/><circle cx="473" cy="52" r="3"/>
      </g>
    </g>
  </svg>;
}

type Realm = "move" | "craft" | "grow";
const themes = {
  move: { sky: "#c7eddd", mist: "#e9f9ec", hills: "#94d3b2", ground: "#61aa8d", tower: "#fff4e0", glow: "#ffe0be" },
  craft: { sky: "#dacdf8", mist: "#fff0e5", hills: "#eeb7c4", ground: "#bd9dd7", tower: "#fff1df", glow: "#fff1aa" },
  grow: { sky: "#e5edd0", mist: "#f9f3db", hills: "#c0dbaf", ground: "#89b68d", tower: "#fff4d6", glow: "#f7eab8" },
} as const;

/** An imaginary illustrated world for a sample seed — never presented as a live quest. */
export function StorybookRealmArt({ realm }: { realm: Realm }) {
  const t = themes[realm];
  const sky = "storybook-" + realm + "-sky";
  const ground = "storybook-" + realm + "-ground";
  return <svg className="sum-storybook-realm-art" viewBox="0 0 540 280" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1"><stop stopColor={t.sky}/><stop offset="1" stopColor={t.mist}/></linearGradient>
      <linearGradient id={ground} x1="0" y1="0" x2=".7" y2="1"><stop stopColor={t.hills}/><stop offset="1" stopColor={t.ground}/></linearGradient>
    </defs>
    <rect width="540" height="280" fill={`url(#${sky})`}/>
    <circle cx="410" cy="54" r="36" fill={t.glow} opacity=".9"/>
    <g fill="#fffefa" opacity=".77">
      <ellipse cx="112" cy="63" rx="94" ry="20"/><ellipse cx="91" cy="50" rx="45" ry="23"/><ellipse cx="153" cy="53" rx="40" ry="19"/>
      <ellipse cx="445" cy="113" rx="80" ry="14"/><ellipse cx="410" cy="104" rx="30" ry="19"/>
    </g>
    <path d="M0 193Q93 132 164 172t148-5 228 13v100H0Z" fill={t.hills} opacity=".48"/>
    <path d="M0 226q86-52 167-29t139 5q98-54 234-9v87H0Z" fill={`url(#${ground})`}/>
    {realm === "move" && <>
      <path d="M66 184h142v-8H66ZM78 164h118v-3H78" fill="#fdf1de" stroke="#fff9e9" strokeWidth="2"/>
      <path d="M85 175v-23m108 23v-23M139 174v-33" stroke="#fff6ea" strokeWidth="4"/>
      <path d="M246 185q34-87 68-83t59 83" stroke="#fffbf1" strokeWidth="11" fill="none" opacity=".8"/>
      <g><path d="M300 174c-21-31-21-57-8-76 18 23 22 49 8 76Z" fill="#5d9e82"/><path d="M300 174c0-38 14-59 31-70 5 35-9 58-31 70Z" fill="#88c99f"/></g>
    </>}
    {realm === "craft" && <>
      <path d="M190 193v-65l22-15 22 15v65Z" fill={t.tower} stroke="#d5a4c0" strokeWidth="4"/>
      <path d="M200 116l12-32 13 32Z" fill="#e2abd0"/>
      <path d="M245 193V95l21-16 22 16v98Z" fill={t.tower} stroke="#d5a4c0" strokeWidth="4"/>
      <path d="m253 78 13-31 13 31Z" fill="#f8d6a9"/>
      <path d="M299 193v-53l22-17 24 17v53Z" fill="#fff9ea" stroke="#deb4c8" strokeWidth="4"/>
      <g fill="#bd9fd1"><rect x="258" y="106" width="13" height="30" rx="6"/><rect x="204" y="135" width="16" height="22" rx="7"/></g>
      <path d="m126 129 5 13 13 5-13 5-5 13-5-13-13-5 13-5 5-13Z" fill="#fff5be"/>
    </>}
    {realm === "grow" && <>
      <path d="M236 220v-96m0 39c-50 0-62-48-62-48 45-7 63 25 62 48Zm0-18c6-53 54-62 54-62 7 40-21 64-54 62Z" fill="#98c6a0" stroke="#508c6c" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M366 209v-73m0 28c-34 0-42-31-42-31 31-8 43 13 42 31Zm0-18c5-37 37-43 37-43 6 28-14 44-37 43Z" fill="#bce2af" stroke="#6d9b7a" strokeWidth="6" strokeLinecap="round"/>
      <path d="M77 194q48-38 93 0" stroke="#faf4d7" strokeWidth="7" fill="none"/>
    </>}
    <ellipse cx="262" cy="230" rx="231" ry="17" fill="#d6f0dc" opacity=".28"/>
    <path d="M0 262q66-47 129-17t139-9 133-4 139 9v39H0Z" fill={t.ground} opacity=".7"/>
    <g fill="#fff9e8">
      <circle cx="73" cy="231" r="5"/><circle cx="69" cy="224" r="5"/><circle cx="79" cy="225" r="5"/>
      <circle cx="463" cy="232" r="5"/><circle cx="457" cy="226" r="5"/><circle cx="469" cy="226" r="5"/>
    </g>
    <g fill="#f7d18e"><circle cx="73" cy="228" r="3"/><circle cx="463" cy="229" r="3"/></g>
    <g fill="#fffefa" opacity=".8"><circle cx="49" cy="94" r="3"/><circle cx="340" cy="52" r="3"/><path d="m444 34 3 6 6 3-6 3-3 6-3-6-6-3 6-3 3-6Z"/></g>
  </svg>;
}
