import {
  LayoutDashboard,
  IdCard,
  Compass,
  MapPinned,
  Briefcase,
  CalendarDays,
  Gift,
  Users,
  MessageCircle,
  Bell,
  Settings,
  Building2,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  primary?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, primary: true },
  { href: "/live", label: "Live Map", icon: MapPinned, primary: true },
  { href: "/gigs", label: "Gigs & Jobs", icon: Briefcase, primary: true },
  { href: "/events", label: "Events", icon: CalendarDays, primary: true },
  { href: "/passport", label: "Passport", icon: IdCard, primary: true },
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/connections", label: "Connections", icon: Users },
  { href: "/rewards", label: "FLOW Points", icon: Gift },
  { href: "/messages", label: "Messages", icon: MessageCircle },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/business", label: "Business", icon: Building2 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export const PRIMARY_NAV = NAV_ITEMS.filter((i) => i.primary);
export const SECONDARY_NAV = NAV_ITEMS.filter((i) => !i.primary);
