import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileText,
  Home,
  LogOut,
  Menu,
  MessageCircle,
  MoreVertical,
  Pencil,
  Plus,
  Receipt,
  Search,
  Send,
  Settings,
  Smartphone,
  Trash2,
  Users,
  Wallet,
  WifiOff,
  X,
} from 'lucide-react-native';
import { color } from './tokens';

const ICONS = {
  alert: AlertTriangle,
  back: ArrowLeft,
  bell: Bell,
  check: Check,
  chevronDown: ChevronDown,
  chevronRight: ChevronRight,
  help: CircleHelp,
  copy: Copy,
  download: Download,
  eye: Eye,
  eyeOff: EyeOff,
  invoice: FileText,
  home: Home,
  logout: LogOut,
  more: Menu,
  whatsapp: MessageCircle,
  kebab: MoreVertical,
  edit: Pencil,
  plus: Plus,
  receipt: Receipt,
  search: Search,
  send: Send,
  settings: Settings,
  phone: Smartphone,
  trash: Trash2,
  clients: Users,
  wallet: Wallet,
  offline: WifiOff,
  close: X,
} as const;

export type IconName = keyof typeof ICONS;

/** Lucide at 1.75 stroke. Always paired with a text label (or an accessibilityLabel on its button). */
export function Icon({ name, size = 20, color: c = color.ink2 }: { name: IconName; size?: number; color?: string }) {
  const Cmp = ICONS[name];
  return <Cmp size={size} color={c} strokeWidth={1.75} />;
}
