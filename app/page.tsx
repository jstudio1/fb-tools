import { Suspense } from "react";
import Poster from "./poster";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Poster />
    </Suspense>
  );
}
