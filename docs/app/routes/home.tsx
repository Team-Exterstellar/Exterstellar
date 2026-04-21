import { useEffect, useState } from "react";
import logo from "/ExterstellarLogo.png";
import { Link } from "react-router";

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
  const [browser, setBrowser] = useState("Chrome");

  useEffect(() => {
    const small = multipleBoxShadow(700);
    const medium = multipleBoxShadow(200);
    const big = multipleBoxShadow(100);

    const style = document.createElement("style");
    style.id = "stars-style";
    style.textContent = `
      html, body {height: 100%; margin: 0;}
      body {
        overflow-x: hidden;
      }
      #stars {width:1px; height:1px; background:transparent; box-shadow:${small}; animation: animStar 50s linear infinite;}
      #stars2 {width:2px; height:2px; background:transparent; box-shadow:${medium}; animation: animStar 100s linear infinite;}
      #stars3 {width:3px; height:3px; background:transparent; box-shadow:${big}; animation: animStar 150s linear infinite;}
      #stars::after {content: ""; position:absolute; top:2000px; width:1px; height:1px; background:transparent; box-shadow:${small};}
      #stars2::after {content: ""; position:absolute; top:2000px; width:2px; height:2px; background:transparent; box-shadow:${medium};}
      #stars3::after {content: ""; position:absolute; top:2000px; width:3px; height:3px; background:transparent; box-shadow:${big};}
      @keyframes animStar {
        from {transform: translateY(0px);}
        to {transform: translateY(-2000px);}
      }
    `;
    document.head.appendChild(style);
    return () => document.getElementById("stars-style")?.remove();
  }, []);

  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.includes("firefox")) { // firefox
      setBrowser("Firefox");
    } else if (userAgent.includes("safari") && !userAgent.includes("chrome")) {
      setBrowser("Safari");
    } else if (userAgent.includes("ladybird")) {
      setBrowser("Ladybird");
    } else { // default to chrome (since that's the browser that most people use)
      
    }
  }, []);

  return (
    <div className="flex flex-col">
      <div id="stars"/>
      <div id="stars2"/>
      <div id="stars3"/>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center my-32">
        <div className="flex justify-end pr-[6dvw] appear-1000">
          <button>Install for {browser}</button>
        </div>
        <img src={logo} alt="Extersteller Logo" className="w-[40dvw] h-auto shrink-0 appear-500" />
        <div className="flex justify-start pl-[6dvw] appear-1000">
          <a href="https://github.com/Team-Exterstellar/Exterstellar" className="btn">View Source</a>
        </div>
      </div>
    </div>
  );
}