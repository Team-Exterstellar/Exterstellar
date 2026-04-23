import { useEffect, useState } from "react";
import { motion } from "motion/react";
import logo from "/ExterstellarLogo.png";
import MobileParserModule from "device-detector-js/dist/parsers/device/mobiles.js";
import Lenis from "lenis";
import 'lenis/dist/lenis.css';

export function meta() {
  return [
    { title: "Exterstellar" },
    { name: "description", content: "A QoL-focused browser extension for Stardance." },
  ];
}

function multipleBoxShadow(n: number): string {
  const rand = () => Math.floor(Math.random() * 2000);
  let value = `${rand()}px ${rand()}px #FFF`;
  for (let i = 2; i <= n; i++) {
    value += `, ${rand()}px ${rand()}px #FFF`;
  }
  return value;
}

export default function Home() {
  const [browser, setBrowser] = useState({
    name: "Chrome",
    disabled: false
  });
  const [logoSrc, setLogoSrc] = useState(logo);
  const MobileParser = (MobileParserModule as any).default;

  let meClicks = 0;

  useEffect(() => {
    const small = multipleBoxShadow(700);
    const medium = multipleBoxShadow(200);
    const big = multipleBoxShadow(100);

    const style = document.createElement("style");
    style.id = "stars-style";
    style.textContent = `
      #stars {box-shadow: ${small};}
      #stars2 {box-shadow: ${medium};}
      #stars3 {box-shadow: ${big};}
      #stars::after {box-shadow: ${small};}
      #stars2::after {box-shadow: ${medium};}
      #stars3::after {box-shadow: ${big};}
    `;
    document.head.appendChild(style);
    return () => document.getElementById("stars-style")?.remove();
  }, []);

  useEffect(() => {
    const lenis = new Lenis();

    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }

    requestAnimationFrame(raf);

    return () => lenis.destroy();
  }, []);

  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    // check if the user is on mobile first
    const result = new MobileParser().parse(userAgent);
    if (result && result.type) {
      setBrowser({name: "Mobile", disabled: true});
      return;
    }
    
    if (userAgent.includes("firefox")) { // firefox
      setBrowser({name: "Firefox", disabled: false});
    } else if (userAgent.includes("safari") && !userAgent.includes("chrome")) {
      setBrowser({name: "Safari", disabled: true});
    } else if (userAgent.includes("ladybird")) {
      setBrowser({name: "Ladybird", disabled: true});
    } else { // default to chrome (since that's the browser that most people use)
      
    }
  }, []);

  function monopolyEasteregg() {
    if (meClicks >= 5) {
      setLogoSrc("/monopolies/StardanceUtilsLogoReal.png");
      meClicks -= 1;
    } else {
      setLogoSrc("/ExterstellarLogo.png");
      meClicks += 1;
    }
  }

  return (
    <div className="flex flex-col">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div id="stars"/>
        <div id="stars2"/>
        <div id="stars3"/>
      </div>
      <div className="flex flex-col gap-8 min-h-screen justify-center">
        <motion.p
          initial={{opacity: 0, y: -10}}
          whileInView={{opacity: 1, y: 0}}
          transition={{duration: 1.0}}
          viewport={{once: true}}
          className="text-center"
        >Brought to you by <a href="https://flux3tor.xyz/" target="_blank">Flux3tor</a> & <a href="https://hackclub.enterprise.slack.com/archives/C08RSTCKW2X" target="_blank">Sabio</a>!</motion.p>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center">
          <motion.div
            initial={{opacity: 0, x: -10}}
            whileInView={{opacity: 1, x: 0}}
            transition={{duration: 1.0, delay: 1.0}}
            viewport={{once: true}}
            className="flex justify-end pr-[6dvw]"
          >
            <motion.button
              whileHover={!browser.disabled ? {scale: 1.05, backgroundColor: "var(--color-white)", color: "var(--color-black)", borderColor: "transparent"} : {}}
              whileTap={!browser.disabled ? {scale: 1, backgroundColor: "var(--color-gray-900)", color: "var(--color-white)", borderColor: "var(--color-gray-600)"} : {}}
              transition={{duration: 0.3, ease: "easeInOut"}}
              disabled={browser.disabled}
              className={browser.disabled ? "opacity-50! cursor-not-allowed!" : ""}
            >
              {browser.disabled ? `Unavailable for ${browser.name}` : `Install for ${browser.name}`}
            </motion.button>
          </motion.div>
          <motion.img
            src={logoSrc}
            alt="Exterstellar Logo"
            className="w-[40dvw] h-auto shrink-0"
            initial={{opacity: 0, y: 40}}
            whileInView={{opacity: 1, y: 0}}
            transition={{duration: 1.0, delay: 0.5}}
            viewport={{once: true}}
            onClick={monopolyEasteregg}
            id="exterstellarLogo"
          />
          <motion.div
            initial={{opacity: 0, x: 10}}
            whileInView={{opacity: 1, x: 0}}
            transition={{duration: 1.0, delay: 1.5}}
            viewport={{once: true}}
            className="flex justify-start pl-[6dvw]"
          >
            <motion.a
              whileHover={{scale: 1.05, backgroundColor: "var(--color-white)", color: "var(--color-black)", borderColor: "transparent"}}
              whileTap={{scale: 1, backgroundColor: "var(--color-gray-900)", color: "var(--color-white)", borderColor: "var(--color-gray-600)"}}
              transition={{duration: 0.3, ease: "easeInOut"}}
              href="https://github.com/Team-Exterstellar/Exterstellar"
              className="btn no-underline!"
              target="_blank"
            >View Source</motion.a>
          </motion.div>
        </div>
        <motion.p
          initial={{opacity: 0, y: -10}}
          whileInView={{opacity: 1, y: 0}}
          transition={{duration: 1.0, delay: 2.0}}
          viewport={{once: true}}
          className="text-center mx-[20dvw]"
        >Exterstellar is a QoL-focused browser extension for Stardance. Join <a href="https://hackclub.enterprise.slack.com/archives/C0ATUJ6703G" target="_blank">#exterstellar</a> on 
        Slack to stay up to date with the latest news and updates!</motion.p>
      </div>
      <div className="flex flex-col gap-3 text-center">
        <motion.p
          initial={{opacity: 0, y: -10}}
          whileInView={{opacity: 1, y: 0}}
          transition={{duration: 1.0}}
          viewport={{once: true, amount: 0.5}}
          className="text-4xl font-bold"
        >Boost Stardance now!</motion.p>
        <motion.p
          initial={{opacity: 0, y: -10}}
          whileInView={{opacity: 1, y: 0}}
          transition={{duration: 1.0, delay: 0.25}}
          viewport={{once: true, amount: 0.5}}
        >Enhance your Stardance experience now with Exterstellar.</motion.p>
      </div>
    </div>
  );
}