import { Router } from "express";
import rateLimit from "express-rate-limit";
import { asyncHandler, ok } from "../../common/http";
import { validate } from "../../common/validate";
import { submitContactSchema } from "./contact.schemas";
import * as contactService from "./contact.service";

export const contactRouter = Router();

// Public, unauthenticated — the homepage contact form. Kept tight since it's
// open to the internet with no login gate.
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many messages sent. Please try again later." } },
});

contactRouter.post(
  "/",
  contactLimiter,
  validate(submitContactSchema),
  asyncHandler(async (req, res) => {
    await contactService.submitContact((req as any).validatedBody);
    return ok(res, { message: "Message sent." });
  })
);
