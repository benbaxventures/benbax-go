export type UserRole = 'CUSTOMER' | 'RIDER' | 'DRIVER' | 'ADMIN' | 'SUPPORT' | 'OPERATIONS';

export type DeliveryCategory =
  | 'FOOD'
  | 'PARCEL'
  | 'COURIER'
  | 'GROCERY'
  | 'PHARMACY'
  | 'TRANSPORT_READY';

export type DeliveryStatus =
  | 'DRAFT'
  | 'REQUESTED'
  | 'ASSIGNING'
  | 'ASSIGNED'
  | 'PICKING_UP'
  | 'IN_TRANSIT'
  | 'ARRIVED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'FAILED';

export type RiderStatus = 'PENDING_KYC' | 'ACTIVE' | 'SUSPENDED' | 'OFFLINE' | 'ON_DELIVERY';

export type DriverStatus = 'PENDING_KYC' | 'ACTIVE' | 'SUSPENDED' | 'OFFLINE' | 'ON_TRIP';

export type RideTripStatus =
  | 'REQUESTED'
  | 'ASSIGNING'
  | 'ASSIGNED'
  | 'DRIVER_ARRIVING'
  | 'ARRIVED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'FAILED';

export type PaymentMethod = 'MTN_MOMO' | 'PAYSTACK_CARD' | 'WALLET' | 'CASH_ON_DELIVERY';

export type PaymentStatus = 'PENDING' | 'AUTHORIZED' | 'PAID' | 'FAILED' | 'REFUNDED';

export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type AddressPoint = Coordinates & {
  label: string;
  formattedAddress?: string;
  landmark?: string;
  voiceNoteUrl?: string;
  whatsappLocationUrl?: string;
  contactName?: string;
  contactPhone?: string;
};

export type DeliveryQuote = {
  distanceKm: number;
  estimatedMinutes: number;
  baseFare: number;
  surgeMultiplier: number;
  serviceFee: number;
  total: number;
  currency: 'GHS';
};

export type DeliverySummary = {
  id: string;
  trackingCode: string;
  category: DeliveryCategory;
  status: DeliveryStatus;
  pickup: AddressPoint;
  dropoff: AddressPoint;
  quote: DeliveryQuote;
  scheduledFor?: string;
  rider?: {
    id: string;
    name: string;
    phone: string;
    rating: number;
    avatarUrl?: string;
    vehicleType?: string;
  };
  createdAt: string;
};

export type RiderAssignment = {
  id: string;
  deliveryId: string;
  riderId: string;
  status: 'OFFERED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'COMPLETED';
  expiresAt: string;
};

export type ApiErrorShape = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};
