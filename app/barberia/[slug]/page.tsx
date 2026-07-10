import { redirect } from "next/navigation";

type BarberiaPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function BarberiaPage({ params }: BarberiaPageProps) {
  const { slug } = await params;

  redirect(`/?barberia=${encodeURIComponent(slug)}`);
}
