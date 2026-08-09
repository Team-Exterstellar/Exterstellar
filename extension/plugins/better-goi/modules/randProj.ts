import type { Cfg } from "./types";

export function handleRandomProject(cfg: Cfg) {
  if (cfg.randomProjectBTN === false || cfg.randomProjectBTN === "false")
    return;
  if (document.querySelector("[data-exterstellar-random-project-btn]")) return;

  const filtersBTN = document.querySelector("a.ysws-queue__reset-filters");
  if (!filtersBTN) return;

  const button = document.createElement("a");
  button.classList.add("slim", "exterstellar-random-project-btn");
  button.setAttribute("data-exterstellar-random-project-btn", "1");
  button.textContent = "Open a random project";

  button.addEventListener("click", () => {
    const table = document.querySelector(".ysws-queue__table-container table");
    if (!table) return;

    const rows = Array.from(
      table.querySelectorAll("tbody tr"),
    ) as HTMLTableRowElement[];

    if (rows.length === 0) return;

    const links = rows
      .map((row) =>
        row.querySelector<HTMLAnchorElement>("a.ysws-queue__view-btn"),
      )
      .filter((link): link is HTMLAnchorElement => link !== null);

    if (links.length === 0) return;

    const choice = links[Math.floor(Math.random() * links.length)];

    const w = window.open(choice!.href, "_blank", "noopener,noreferrer");
    if (w) w.opener = null;
  });

  filtersBTN.after(button);
}