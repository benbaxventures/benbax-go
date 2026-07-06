export type RootStackParamList = {
  Welcome: undefined;
  SignIn: { mode?: 'login' | 'register'; role?: 'DRIVER' | 'RIDER' } | undefined;
  ForgotPassword: undefined;
  ResetPassword: { phone: string; resetToken: string };
  OnboardingFlow: undefined;
  MainTabs: undefined;
  ActiveTrip: { tripId: string };
  ActiveDelivery: { deliveryId: string };
  WalletCheckout: { authorizationUrl: string; reference: string; walletTransactionId?: string };
  EditProfile: undefined;
  Wallet: undefined;
  PriorityDetails: undefined;
  ShiftSchedule: undefined;
  News: undefined;
};

export type MainTabsParamList = {
  RideDispatch: undefined;
  DeliveryDispatch: undefined;
  Earnings: undefined;
  KYC: undefined;
  Profile: undefined;
};
