import { agencies, categories } from "@/data/agencies";
import { AgenciesClient } from "./agencies-client";

export default function AgenciesPage() {
  return <AgenciesClient agencies={agencies} categories={categories} />;
}
