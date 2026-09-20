import type { Metadata } from "next";
import { AccessAdmin } from "@/components/admin/access-admin";

export const metadata: Metadata = { title: "Access admin", robots: { index: false, follow: false } };

export default function Page() {
  return <AccessAdmin />;
}
