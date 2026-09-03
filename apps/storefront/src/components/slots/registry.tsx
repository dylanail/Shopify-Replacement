import type { SlotComponent } from "./Slot";
import { ReviewBadge } from "./reviews/ReviewBadge";
import { ReviewWall } from "./reviews/ReviewWall";
import { HappyCustomersBanner } from "./reviews/HappyCustomersBanner";
import { merchComponent } from "./merch/MerchOffer";
import { FreeShippingGapCloser } from "./plugins/FreeShippingGapCloser";
import { PostPurchaseOffer } from "./plugins/PostPurchaseOffer";
import { ExitIntentModal } from "./plugins/ExitIntentModal";
import { ContactForm } from "./plugins/ContactForm";
import { EngravingButton } from "./plugins/EngravingButton";
import { Ga4Provider, MetaPixelProvider, MetaPdpEvent, TikTokPixelProvider, GoogleAdsTag } from "./analytics/providers";

/** Every component id a theme, plugin manifest or merch config can reference. Unknown ids render nothing. */
export const REGISTRY: Record<string, SlotComponent> = {
  ReviewBadge, ReviewWall, HappyCustomersBanner,
  FrequentlyBoughtTogether: merchComponent("FrequentlyBoughtTogether"), FbtGrid: merchComponent("FbtGrid"), BundleOffer: merchComponent("BundleOffer"),
  CompleteYourRoutine: merchComponent("CompleteYourRoutine"), CompleteYourSet: merchComponent("CompleteYourSet"), BuyMoreGetFree: merchComponent("BuyMoreGetFree"),
  BundlePackTriple: merchComponent("BundlePackTriple"), BundlePackDuo: merchComponent("BundlePackDuo"), HorizontalTripleTier: merchComponent("HorizontalTripleTier"),
  ChooseYourDealDuo: merchComponent("ChooseYourDealDuo"), BogoHorizontal: merchComponent("BogoHorizontal"), BogoVertical: merchComponent("BogoVertical"),
  GoesWithWidget: merchComponent("GoesWithWidget"), CompleteTheLook: merchComponent("CompleteTheLook"), WeSavedOneForYou: merchComponent("WeSavedOneForYou"),
  PairsWellGrid: merchComponent("PairsWellGrid"), FreeGiftSelector: merchComponent("FreeGiftSelector"), RoutineBuilder: merchComponent("RoutineBuilder"),
  FreeShippingGapCloser, PostPurchaseOffer, ExitIntentModal, ContactForm, EngravingButton,
  Ga4Provider, MetaPixelProvider, MetaPdpEvent, TikTokPixelProvider, GoogleAdsTag,
};
export const REGISTRY_IDS = Object.keys(REGISTRY);
