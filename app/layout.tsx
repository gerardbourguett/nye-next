import type { Metadata } from "next";
import { Archivo, Big_Shoulders } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/components/theme-provider";

// Board type, city names, and all display numerals. The Google Fonts
// catalog available to this Next.js version consolidated the old separate
// "Big Shoulders Display" / "Big Shoulders Text" cuts into one variable
// family with an optical-size (opsz) axis, so the variable weight is
// requested here and pushed heavy (800/900) at display sizes in page.tsx.
const bigShoulders = Big_Shoulders({
  subsets: ["latin"],
  weight: "variable",
  variable: "--font-display",
});

// Spec lines, labels, body copy, and the countdown/clock digits — see
// page.tsx for why the digits live in Archivo rather than the display face.
const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "#2027Live",
  description:
    "Midnight isn't a moment, it's a 26-hour relay. Watch all 24 timezones cross into 2027 one by one and catch vanderfondi's live New Year's Eve broadcast at twitch.tv/vanderfondi.",
  openGraph: {
    title: "#2027Live",
    description:
      "Follow midnight as it crosses the planet, timezone by timezone, and catch the hour's stream lineup from vanderfondi's live New Year's Eve broadcast.",
    siteName: "#2027Live",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={cn(
        "h-full",
        "antialiased",
        bigShoulders.variable,
        archivo.variable,
        "font-sans",
      )}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        {/*
          A JSX-syntax comment is stripped at compile time and produces no
          DOM node at all, so the direction contract below is written into
          the DOM as a literal HTML comment via dangerouslySetInnerHTML on a
          zero-footprint (display:none, aria-hidden) wrapper — the closest
          a React tree can get to "a raw HTML comment as the first child of
          body" while still surviving the production build unminified.
        */}
        <div
          aria-hidden
          suppressHydrationWarning
          style={{ display: "none" }}
          dangerouslySetInnerHTML={{
            __html: `<!--
THESIS: Midnight is a 26-hour relay, not a moment - so this is an election-night desk calling 24 timezones as they cross, refusing the centered mega-countdown hero.
OWN-WORLD: Lit broadcast studio. Deep cobalt ground, gold as the CALLED state, call-red LIVE bugs, cool blue-white pending. Big Shoulders Display board type, Archivo spec lines. Bands and lower-thirds, never cards.
STORY: The viewer sees how long until their own midnight in one glance, watches the planet cross ahead of them, and picks what to watch this hour.
FIRST VIEWPORT: 24 timezone bands fill the frame; crossed bands flooded gold with CALLED stamps; the anchor clock pinned top-right at the page's largest scale; the hour's 1-4 streams as a lower-third strip at the bottom edge.
FORM: The Election Night Desk; ranked 1 of 7; user-locked over the roll; seed key 551e9ef7.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
-->`,
          }}
        />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
