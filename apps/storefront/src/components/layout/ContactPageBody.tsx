"use client";
import { ContactFormFields } from "@/components/slots/plugins/ContactForm";
/** The contact page always offers a form; the plugin's settings only change the heading and notify address on the core side. */
export function ContactPageBody() { return <ContactFormFields />; }
