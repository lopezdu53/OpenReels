import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 22, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden {...rest}>
      {children}
    </svg>
  );
}

export function YoutubeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M23.5 6.2a3 3 0 0 0-2.1-2.2C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 32 32 0 0 0 0 12a32 32 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.2c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.2A32 32 0 0 0 24 12a32 32 0 0 0-.5-5.8zM9.8 15.6V8.4L15.8 12l-6 3.6z" />
    </Svg>
  );
}

export function TiktokIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14.5 3h3.1c.3 2.5 1.8 4.4 4.4 4.7v3.1c-1.6 0-3.1-.5-4.4-1.4v6.4a6.8 6.8 0 1 1-6.8-6.8h.1v3.3a3.5 3.5 0 1 0 2.4 3.3V3z" />
    </Svg>
  );
}

export function FacebookIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14 9h3V6h-3c-2.8 0-5 2.2-5 5v2H6v3h3v8h3v-8h3.2l.8-3H12v-2c0-.6.4-1 1-1z" />
    </Svg>
  );
}

export function XIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M17.6 3h3.1l-6.8 7.8L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.3-8.3L2 3h6.3l4.4 5.8L17.6 3zm-1.1 16.2h1.7L7.6 4.7H5.8l10.7 14.5z" />
    </Svg>
  );
}

export function BilibiliIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5.2 6.2 7.6 3.8l1.4 1.4-1.8 1.8h9.6l-1.8-1.8 1.4-1.4 2.4 2.4H21a2 2 0 0 1 2 2v9.5a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8.2a2 2 0 0 1 2-2h2.2zM4.2 9.5v7.8h15.6V9.5H4.2zm3.4 1.6 2.4 1.8-2.4 1.8v-3.6zm8.8 0v3.6l-2.4-1.8 2.4-1.8z" />
    </Svg>
  );
}
