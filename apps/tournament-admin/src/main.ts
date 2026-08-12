import "@hema/ui";
import "./styles.css";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("App root not found.");

app.innerHTML = "<stage-view></stage-view>";
