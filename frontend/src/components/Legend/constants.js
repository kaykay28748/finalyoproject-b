import {
  IconMap, IconAccessibility, IconMoon, IconBolt,
  IconWalk, IconCar, IconBicycle, IconJog,
} from "../ui/icon";

export const MODE_CONFIG = {
  walk:    { icon: IconWalk,    label: "Walk",  color: "#14b8a6" },
  bicycle: { icon: IconBicycle, label: "Cycle", color: "#ec4899" },
  jogging: { icon: IconJog,     label: "Jog",   color: "#f97316" },
  car:     { icon: IconCar,     label: "Drive", color: "#ef4444" },
};

export const MODES = Object.entries(MODE_CONFIG).map(([key, val]) => ({
  key, ...val,
}));

export const PROFILE_CONFIG = {
  standard:   { label: "Standard",     color: "#2563eb", icon: IconMap,
                description: "Balanced default — best pavement & surface quality." },
  accessible: { label: "Accessible",   color: "#8b5cf6", icon: IconAccessibility,
                description: "Avoids steps, steep slopes & uneven surfaces." },
  night:      { label: "Night Safety", color: "#f59e0b", icon: IconMoon,
                description: "Prefers lit, busier routes after dark." },
  fastest:    { label: "Fastest",      color: "#22c55e", icon: IconBolt,
                description: "Shortest travel time for your mode." },
};

export const PROFILES = Object.entries(PROFILE_CONFIG).map(([key, val]) => ({
  key, ...val,
}));
