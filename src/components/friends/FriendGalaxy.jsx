import { useSyncExternalStore } from "react";
import Galaxy from "./Galaxy.jsx";

const nightStars = ["#edf3ff", "#aec7ff", "#d4e4ff", "#ffecd8"];
const daylightStars = ["#829cc8", "#a7bde1", "#7490b9", "#dec9a4"];

function subscribeToTheme(onChange) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

function isLightTheme() {
  return document.documentElement.dataset.theme === "light";
}

function getServerTheme() {
  return false;
}

export default function FriendGalaxy() {
  const lightMode = useSyncExternalStore(
    subscribeToTheme,
    isLightTheme,
    getServerTheme,
  );

  return (
    <Galaxy
      className="friend-galaxy"
      aria-hidden="true"
      density={1.02}
      glowIntensity={0.31}
      flareIntensity={0.62}
      starSize={1.02}
      starSpeed={0.35}
      speed={0.6}
      rotationSpeed={0.035}
      repulsionStrength={1.2}
      lightMode={lightMode}
      starColors={lightMode ? daylightStars : nightStars}
      opacity={lightMode ? 0.76 : 1}
      intro={false}
    />
  );
}
