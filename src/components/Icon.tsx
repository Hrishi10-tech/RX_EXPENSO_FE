/**
 * Lucide icons under the prototype's names (proto/assets/icons.json was built from the same Lucide set),
 * drawn like the prototype's I(): stroke 2, round caps, class "i", hidden from screen readers.
 */
import {
  Activity, Archive, ArchiveRestore, ArrowLeft, ArrowLeftRight, ArrowRight, BadgeCheck, Ban, Banknote, BedDouble, Bell, BellOff, BellRing,
  BookOpen, BookUser, BriefcaseBusiness, Building2, Calendar, CalendarClock, CalendarRange, Camera, Car, ChartColumn, Check, CheckCheck,
  ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Circle, CircleCheck, CircleDot, CircleEllipsis, CircleHelp, CircleX, Clock, CloudOff,
  CloudUpload, Coins, Copy, CreditCard, Crown, Download, Ellipsis, EllipsisVertical, ExternalLink, Eye, EyeOff, File, FileArchive, FileCheck,
  FileSpreadsheet, FileText, Fingerprint, Flag, FlagOff, Fuel, Gauge, Globe, HandCoins, Hash, History, Hotel, Hourglass, House, Image, IndianRupee,
  Inbox, Info, Keyboard, KeyRound, Landmark, Laptop, Layers, LayoutDashboard, LayoutGrid, Link, List, ListChecks, ListFilter, LoaderCircle, Lock,
  LogIn, LogOut, Mail, MapPin, Maximize2, MessageSquare, Minus, Monitor, Moon, Navigation, Package, PanelRight, Paperclip, Pencil, Percent,
  PiggyBank, Pin, Plane, Play, Plus, Printer, QrCode, Receipt, RefreshCw, RotateCcw, RotateCw, Route, ScanLine, Search, Send, Settings, Share2,
  ShieldAlert, ShieldCheck, SlidersHorizontal, Smartphone, Sparkles, Split, Square, Star, Stethoscope, Sun, Tag, Ticket, Timer, TrainFront,
  Trash2, TrendingUp, TriangleAlert, Undo2, Upload, User, UserCheck, UserCog, UserMinus, UserPlus, Users, UserX, Utensils, Wallet, Wifi, WifiOff,
  Wine, Workflow, X, Zap, ZoomIn, ZoomOut, type LucideIcon,
} from 'lucide-react';

const ICONS = {
  activity: Activity, alert: TriangleAlert, archive: Archive, archiveRestore: ArchiveRestore, arrowLeft: ArrowLeft, arrowRight: ArrowRight,
  badgeCheck: BadgeCheck, ban: Ban, bank: Landmark, banknote: Banknote, bell: Bell, bellOff: BellOff, bellRing: BellRing, book: BookOpen,
  building: Building2, cab: Car, calendar: Calendar, calendarClock: CalendarClock, calendarRange: CalendarRange, camera: Camera, card: CreditCard,
  chart: ChartColumn, check: Check, checkCircle: CircleCheck, checks: CheckCheck, chevronDown: ChevronDown, chevronLeft: ChevronLeft,
  chevronRight: ChevronRight, chevronUp: ChevronUp, circle: Circle, clock: Clock, cloud: CloudUpload, cloudOff: CloudOff, coins: Coins, copy: Copy,
  courier: Package, crown: Crown, dashboard: LayoutDashboard, dot: CircleDot, download: Download, entertainment: Wine, external: ExternalLink,
  eye: Eye, eyeOff: EyeOff, file: File, fileCheck: FileCheck, fileSheet: FileSpreadsheet, fileText: FileText, fileZip: FileArchive, filter: ListFilter,
  fingerprint: Fingerprint, flag: Flag, flagOff: FlagOff, flows: Workflow, fuel: Fuel, gauge: Gauge, globe: Globe, grid: LayoutGrid, hand: HandCoins,
  hash: Hash, help: CircleHelp, history: History, home: House, hotel: BedDouble, hotelBuilding: Hotel, hourglass: Hourglass, image: Image,
  inbox: Inbox, info: Info, key: KeyRound, keyboard: Keyboard, laptop: Laptop, layers: Layers, link: Link, list: List, listChecks: ListChecks,
  loader: LoaderCircle, lock: Lock, logIn: LogIn, logOut: LogOut, mail: Mail, mapPin: MapPin, maximize: Maximize2, meals: Utensils,
  message: MessageSquare, minus: Minus, monitor: Monitor, moon: Moon, more: Ellipsis, moreV: EllipsisVertical, navigation: Navigation,
  otherCat: CircleEllipsis, panelRight: PanelRight, paperclip: Paperclip, passport: BookUser, pencil: Pencil, percent: Percent, phone: Smartphone,
  piggy: PiggyBank, pin: Pin, plane: Plane, play: Play, plus: Plus, printer: Printer, qr: QrCode, receipt: Receipt, refresh: RefreshCw,
  rotate: RotateCw, rotateBack: RotateCcw, route: Route, rupee: IndianRupee, scan: ScanLine, search: Search, send: Send, settings: Settings,
  share: Share2, shield: ShieldCheck, shieldAlert: ShieldAlert, sliders: SlidersHorizontal, smartphone: Smartphone, sparkle: Sparkles,
  split: Split, star: Star, stethoscope: Stethoscope, stop: Square, sun: Sun, swap: ArrowLeftRight, tag: Tag, ticket: Ticket, timer: Timer,
  train: TrainFront, trash: Trash2, trend: TrendingUp, trip: BriefcaseBusiness, undo: Undo2, upload: Upload, user: User, userCheck: UserCheck,
  userCog: UserCog, userMinus: UserMinus, userPlus: UserPlus, userX: UserX, users: Users, wallet: Wallet, wifi: Wifi, wifiOff: WifiOff,
  x: X, xCircle: CircleX, zap: Zap, zoom: ZoomIn, zoomOut: ZoomOut,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 18, className, title }: { name: IconName; size?: number; className?: string; title?: string }) {
  const C = ICONS[name] ?? Circle;
  return (
    <C
      className={'i' + (className ? ' ' + className : '')}
      width={size}
      height={size}
      strokeWidth={2}
      absoluteStrokeWidth={false}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      role={title ? 'img' : undefined}
      focusable={false}
    />
  );
}
