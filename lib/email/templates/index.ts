import {
  ActivateCustomer,
  activateCustomerText,
  type ActivateCustomerProps
} from "./ActivateCustomer";
import {
  ActivateOwner,
  activateOwnerText,
  type ActivateOwnerProps
} from "./ActivateOwner";
import {
  BookingCancelled,
  bookingCancelledText,
  type BookingCancelledProps
} from "./BookingCancelled";
import {
  BookingConfirmed,
  bookingConfirmedText,
  type BookingConfirmedProps
} from "./BookingConfirmed";
import {
  CustomerBookingCancelled,
  customerBookingCancelledText,
  type CustomerBookingCancelledProps
} from "./CustomerBookingCancelled";
import {
  ResetPassword,
  resetPasswordText,
  type ResetPasswordProps
} from "./ResetPassword";
import {
  SubscriptionPaymentFailed,
  subscriptionPaymentFailedText,
  type SubscriptionPaymentFailedProps
} from "./SubscriptionPaymentFailed";
import { VerifyEmail, verifyEmailText, type VerifyEmailProps } from "./VerifyEmail";

export type EmailTemplateProps = {
  VerifyEmail: VerifyEmailProps;
  ResetPassword: ResetPasswordProps;
  ActivateCustomer: ActivateCustomerProps;
  ActivateOwner: ActivateOwnerProps;
  BookingConfirmed: BookingConfirmedProps;
  BookingCancelled: BookingCancelledProps;
  CustomerBookingCancelled: CustomerBookingCancelledProps;
  SubscriptionPaymentFailed: SubscriptionPaymentFailedProps;
};

export type EmailTemplateName = keyof EmailTemplateProps;

export const emailTemplates = {
  VerifyEmail: {
    component: VerifyEmail,
    getText: verifyEmailText
  },
  ResetPassword: {
    component: ResetPassword,
    getText: resetPasswordText
  },
  ActivateCustomer: {
    component: ActivateCustomer,
    getText: activateCustomerText
  },
  ActivateOwner: {
    component: ActivateOwner,
    getText: activateOwnerText
  },
  BookingConfirmed: {
    component: BookingConfirmed,
    getText: bookingConfirmedText
  },
  BookingCancelled: {
    component: BookingCancelled,
    getText: bookingCancelledText
  },
  CustomerBookingCancelled: {
    component: CustomerBookingCancelled,
    getText: customerBookingCancelledText
  },
  SubscriptionPaymentFailed: {
    component: SubscriptionPaymentFailed,
    getText: subscriptionPaymentFailedText
  }
} as const;
