import type { ReactNode } from "react";
import Footer from "@/components/Footer";
import Header from "@/components/Header";

interface ProductLayoutProps {
  children: ReactNode;
}

export default function ProductLayout({ children }: Readonly<ProductLayoutProps>) {
  return (
    <>
      <Header />
      <main id="main-content" tabIndex={-1} className="outline-none">
        {children}
      </main>
      <Footer />
    </>
  );
}
