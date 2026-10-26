import Link from "next/link";
import Image from "next/image";
import SceneTopBar from "@/components/scene/SceneTopBar";
import SummoningPortal from "@/components/universe/SummoningPortal";
import PicoFamiliar from "@/components/familiar/PicoFamiliar";
import {Arrow,Eyebrow,SummonSigil,WorldFooter,WorldGlyph}
  from "@/components/universe/WorldUI";
import {questSeeds} from "@/components/universe/quest-seeds";
import {SumText} from "@/components/locale/SumLanguage";

const translatedRealms:Record<string,{name:string;hint:string}>={
  move:{name:"行动挑战",hint:"让日常行动变成值得记住的冒险。"},
  craft:{name:"创造挑战",hint:"用真实作品记录你的创意。"},
  grow:{name:"成长挑战",hint:"将每天的小目标变成新的进步。"},
};

/** Public, informational website. All meaningful gameplay begins in /app.
 * Marketing links never open a second competing client or create a Quest.
 */
export default function MarketingHome(){
  return <div className="sw-app sw-home sum-award-home sum-kawaii-home"
    data-testid="sum-marketing-site"
    data-product-surface="marketing"
    data-design-version="sum-world-v3" data-art-direction="storybook-world">
    <a className="sw-skip-link" href="#world-introduction">
      <SumText en="Skip to main content" zh="跳到主要内容"/>
    </a>
    <SceneTopBar activePath="/"/>
    <main id="world-introduction" tabIndex={-1}>
      <section className="sw-hero sw-container sum-award-hero"
        aria-labelledby="world-title">
        <div className="sw-hero__copy sum-award-hero__copy">
          <Eyebrow><SumText en="A WORLD OF SMALL, REAL ADVENTURES"
            zh="把日常变成真实的小冒险"/></Eyebrow>
          <h1 id="world-title"><SumText
            en={<>Make reality<br/><em>summonable.</em></>}
            zh={<>让真实世界<br/><em>充满召唤。</em></>}/></h1>
          <p className="sw-hero__lead">
            <SumText
              en="Summoner.world turns your ideas into real Quests. Meet Pico, invite your friends, agree on the rules and keep the moments that matter."
              zh="Summoner.world 将你的想法变成真实的 Quest 挑战。认识 Pico，邀请朋友，约定规则，记录每一个值得珍藏的瞬间。"/>
          </p>
          <div className="sw-hero__actions">
            <Link className="sw-button sum-award-cta" href="/app"
              data-testid="world-summon-cta">
              <SummonSigil/><SumText en="Open SUM Web App" zh="进入 SUM 客户端"/><Arrow/>
            </Link>
            <Link className="sw-text-link" href="#how-it-works">
              <SumText en="Explore how it works" zh="了解怎么玩"/><Arrow/>
            </Link>
          </div>
          <div className="sum-kawaii-hero__whisper" aria-hidden="true">
            <span>✦</span><SumText en="Small ideas. Brighter tomorrows."
              zh="小小的想法，也能点亮明天。"/>
          </div>
          <div className="sum-award-hero__meta">
            <div className="sum-award-hero__line" aria-hidden="true">
              <span>01</span><i/><span>06</span>
            </div>
            <div className="sum-award-hero__meaning">
              <PicoFamiliar mood="guide"/>
              <p><strong><SumText en="You are the Summoner."
                zh="你，就是召唤师。"/></strong>
                <span><SumText en="Your imagination begins the story."
                  zh="你的想象力，是故事的起点。"/></span>
              </p>
            </div>
          </div>
        </div>
        <SummoningPortal/>
      </section>

      <nav className="sum-premium-shortcuts sw-container"
        aria-label="Explore Summoner.world">
        {[
          {href:"#how-it-works",image:"/storybook-premium/realm2.webp",
            en:"How Quests Work",zh:"了解玩法",
            enText:"From idea to real challenge.",zhText:"从想法到真实挑战。"},
          {href:"#companion",image:"/storybook-premium/hero2.webp",
            en:"Meet Pico",zh:"认识 Pico",
            enText:"Your first Familiar.",zhText:"你的第一位召唤伙伴。"},
          {href:"#realms",image:"/storybook-premium/realm1.webp",
            en:"Explore Possibilities",zh:"探索冒险",
            enText:"Create, move and grow.",zhText:"创造、行动和成长。"},
          {href:"#story",image:"/storybook-premium/pico3.webp",
            en:"Our Story",zh:"了解世界观",
            enText:"A world built around your actions.",zhText:"一个因真实行动而改变的世界。"},
        ].map(item=><Link href={item.href} key={item.href}
          className="sum-premium-shortcut">
          <span className="sum-premium-shortcut__art" aria-hidden="true">
            <Image src={item.image} width={90} height={90}
              sizes="90px" alt=""/>
          </span>
          <span className="sum-premium-shortcut__copy">
            <strong><SumText en={item.en} zh={item.zh}/></strong>
            <small><SumText en={item.enText} zh={item.zhText}/></small>
          </span><Arrow/>
        </Link>)}
      </nav>

      <section className="sum-premium-story sw-container" id="story"
        aria-labelledby="sum-premium-story-heading">
        <div className="sum-premium-story__art">
          <Image src="/storybook-premium/pico2.webp" fill
            sizes="(max-width: 959px) 100vw, 52vw"
            alt="Original artwork of Pico in a glowing field"/>
          <span className="sum-premium-story__caption">
            <SumText en="A little magic for the moments that matter."
              zh="给每一个值得铭记的瞬间，一点魔法。"/>
          </span>
        </div>
        <div className="sum-premium-story__copy">
          <Eyebrow><SumText en="THE WORLD OF SUM" zh="SUM 的世界"/></Eyebrow>
          <h2 id="sum-premium-story-heading">
            <SumText en={<>Real Quests.<br/><em>Unforgettable stories.</em></>}
              zh={<>真实挑战。<br/><em>独属于你的故事。</em></>}/>
          </h2>
          <p><SumText
            en="A Quest starts with an idea, grows when people agree on the rules, and becomes a shared story through real actions and proof."
            zh="Quest 从一个想法开始。双方认可规则后一起行动，再用真实的证据和结果留下共同的故事。"/></p>
          <Link className="sw-text-link" href="/app"
            data-testid="sum-marketing-story-cta">
            <SumText en="Play in SUM" zh="进入 SUM 体验"/><Arrow/>
          </Link>
          <p className="sum-premium-story__note">
            <SumText en="Illustrations are examples. Real results require accepted rules and evidence."
              zh="此处展示的是玩法示意。真实结果必须依据双方接受的规则及实际证据。"/>
          </p>
        </div>
      </section>

      <section className="sw-path-section sw-container sum-award-path"
        id="how-it-works" aria-labelledby="path-title">
        <div className="sw-section-heading">
          <div>
            <Eyebrow><SumText en="FOUR STEPS / ONE REAL ADVENTURE"
              zh="四个步骤 · 一次真实的冒险"/></Eyebrow>
            <h2 id="path-title"><SumText
              en={<>The world changes<br/><em>when you act.</em></>}
              zh={<>因为你的行动，<br/><em>世界开始改变。</em></>}/></h2>
          </div>
          <p><SumText
            en="No pretend winners. The app handles actual invitations, proof and result records."
            zh="不制造虚假的胜者。真正的邀请、证据和结果都在客户端中完成与记录。"/></p>
        </div>
        <div className="sw-journey" aria-label="How a Quest works">
          {[
            {en:"Create",zh:"提出挑战",ed:"Give an idea a clear shape",zd:"把想法变成双方理解的规则"},
            {en:"Invite",zh:"邀请朋友",ed:"Agree before starting",zd:"确认参加并认可规则"},
            {en:"Show proof",zh:"提交证据",ed:"Record what actually happened",zd:"记录真正发生的行动"},
            {en:"Review result",zh:"查看结果",ed:"Keep a verifiable receipt",zd:"依据规则保留可核查的结果"},
          ].map((step,i)=><div className="sw-journey__step" key={step.en}>
            <span className="sw-journey__number">0{i+1}</span>
            <span><strong><SumText en={step.en} zh={step.zh}/></strong>
              <small><SumText en={step.ed} zh={step.zd}/></small></span>
            {i<3&&<span className="sw-journey__connector" aria-hidden="true"/>}
          </div>)}
        </div>
      </section>

      <section className="sw-realms-section sw-container sum-award-realms"
        id="realms" aria-labelledby="realms-title">
        <div className="sw-section-heading">
          <div>
            <Eyebrow><SumText en="MORE THAN ONE WAY TO GROW"
              zh="每个人都有自己的成长方式"/></Eyebrow>
            <h2 id="realms-title"><SumText
              en={<>An adventure begins<br/>with your idea.</>}
              zh={<>每一种想法，<br/>都能开启冒险。</>}/></h2>
          </div>
          <Link className="sw-text-link" href="/app" data-testid="sum-marketing-realms-cta">
            <SumText en="Open the SUM client" zh="打开 SUM 客户端"/><Arrow/>
          </Link>
        </div>
        <div className="sw-realms">
          {questSeeds.map((quest,index)=><Link
            className={"sw-realm sw-realm--"+quest.id}
            href="/app" key={quest.id}>
            <div className="sw-realm__header">
              <span className="sw-small-label">0{index+1} / {quest.realm}</span>
              <WorldGlyph kind={quest.kind}/>
            </div>
            <div className="sw-realm__storybook" aria-hidden="true">
              <Image src={quest.id==="move"?"/storybook-premium/realm1.webp":
                  quest.id==="craft"?"/storybook-premium/realm2.webp":
                    "/storybook-premium/realm3.webp"}
                width={620} height={400} className="sum-storybook-realm-img" alt=""
                sizes="(max-width:699px) 100vw, (max-width:959px) 50vw, 33vw"/>
              <span className="sum-realm__spark"><WorldGlyph kind={quest.kind}/></span>
            </div>
            <h3><SumText en={quest.name}
              zh={translatedRealms[quest.id]?.name||quest.name}/></h3>
            <p><SumText en={quest.hint}
              zh={translatedRealms[quest.id]?.hint||quest.hint}/></p>
            <span className="sw-realm__action">
              <SumText en="Try this in SUM" zh="进入 SUM 探索"/><Arrow/>
            </span>
          </Link>)}
        </div>
        <p className="sw-example-footnote"><SumText
          en="Examples only—not live opponents, current locations or verified Quests."
          zh="以上为示例，并非实时挑战、真人对手或定位信息。"/></p>
      </section>

      <section className="sw-companion-section sw-container sum-award-familiar"
        id="companion" aria-labelledby="companion-title">
        <div className="sw-companion-section__visual">
          <div className="sw-companion-orbit" aria-hidden="true"/>
          <div className="sum-kawaii-companion-landscape" aria-hidden="true">
            <Image src="/storybook-premium/pico3.webp" alt="" fill
              sizes="(max-width:699px) 100vw, 44vw"
              className="sum-storybook-companion-img"/>
          </div>
          <PicoFamiliar className="sw-companion-section__pico" mood="listening"/>
          <span className="sw-companion-section__tag">
            <span>FAMILIAR / 001</span><b>PICO</b>
            <small><SumText en="Your first companion." zh="你的第一位伙伴。"/></small>
          </span>
        </div>
        <div className="sw-companion-section__copy">
          <Eyebrow><SumText en="MEET YOUR FIRST FAMILIAR"
            zh="认识你的第一位召唤兽"/></Eyebrow>
          <h2 id="companion-title"><SumText
            en={<>Your story.<br/><span>A friend at your side.</span></>}
            zh={<>你的故事，<br/><span>Pico 陪你开启。</span></>}/></h2>
          <p><SumText
            en="Pico guides your first chapter and helps explain the rules and progress of a real Quest. Your actions remain yours."
            zh="Pico 陪你完成第一章，也帮助理解真实 Quest 的规则与进度。行动与成果始终属于你。"/></p>
          <div className="sw-companion-functions">
            <span><WorldGlyph kind="spark"/><SumText en="Explore ideas" zh="探索想法"/></span>
            <span><WorldGlyph kind="proof"/><SumText en="Understand proof" zh="理解证据"/></span>
            <span><WorldGlyph kind="chronicle"/><SumText en="Review results" zh="查看结果"/></span>
          </div>
          <Link className="sw-text-link" href="/app/story"
            data-testid="sum-marketing-pico-chapter">
            <SumText en="Play Pico's first chapter" zh="试玩 Pico 的第一章"/><Arrow/>
          </Link>
          <p className="sw-fairness-note"><SumText
            en="Pico never accepts a Quest or invents an outcome on your behalf."
            zh="Pico 不会替你接受挑战，也不会编造胜负结果。"/></p>
        </div>
      </section>

      <section className="sw-world-invitation sw-container sum-award-endcap">
        <SummonSigil/>
        <div>
          <Eyebrow><SumText en="YOUR ADVENTURE STARTS IN THE APP"
            zh="你的冒险，从 SUM 客户端开始"/></Eyebrow>
          <h2><SumText en="Ready to enter SUM?" zh="准备好进入 SUM 了吗？"/></h2>
          <p><SumText en="One familiar, one idea, and a real first step."
            zh="带着你的伙伴，从第一个真正的行动开始。"/></p>
        </div>
        <Link className="sw-button sw-button--light" href="/app"
          data-testid="sum-marketing-footer-cta">
          <SumText en="Enter SUM Web App" zh="进入 SUM 客户端"/><Arrow/>
        </Link>
      </section>
    </main>
    <WorldFooter/>
  </div>;
}
