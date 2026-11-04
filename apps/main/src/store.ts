import { renderWordmark } from "@starintel/design/wordmark";
import "@starintel/design/css/tokens.css";
import "@starintel/design/css/base.css";
import "@starintel/design/css/layout.css";
import "@starintel/design/css/components.css";
import "@starintel/design/css/motion.css";

const brand = document.querySelector<HTMLElement>("[data-wordmark]");
if (brand) brand.replaceChildren(renderWordmark({ size: "sm", compact: true }));

const foot = document.querySelector<HTMLElement>("[data-wordmark-sm]");
if (foot) foot.replaceChildren(renderWordmark({ size: "sm", compact: true }));
