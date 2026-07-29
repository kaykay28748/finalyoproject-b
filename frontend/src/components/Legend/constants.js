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
  standard:   { label: "Standard",     color: "#2563eb", icon: IconMap },
  accessible: { label: "Accessible",   color: "#8b5cf6", icon: IconAccessibility },
  night:      { label: "Night Safety", color: "#f59e0b", icon: IconMoon },
  fastest:    { label: "Fastest",      color: "#22c55e", icon: IconBolt },
};

export const PROFILES = Object.entries(PROFILE_CONFIG).map(([key, val]) => ({
  key, ...val,
}));
