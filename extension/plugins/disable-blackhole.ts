export {};
declare const Exterstellar: import("../types").ExterstellarAPI;

Exterstellar.register({
  id: "disableblackhole",
  name: "Disable Blackhole",
  description: "Those blackhole effects lagging your ass? Ts disables them!!",
  author: "Gizzy/CT5 i stole it from them",

  start() {
    const disableBlackhole = () => {
      document
        .querySelectorAll('[data-controller~="blackhole"]')
        .forEach((element) => element.remove());

      document
        .querySelectorAll('[style*="blackhole-cut-"]')
        .forEach((element) => {
          (element as HTMLElement).style.removeProperty("clip-path");
        });

      document
        .querySelectorAll(".blackhole__text-copy, [data-blackhole-target]")
        .forEach((element) => element.remove());
    };

    disableBlackhole();

    const observer = new MutationObserver(() => {
      disableBlackhole();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  },
});