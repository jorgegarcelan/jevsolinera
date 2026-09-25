import "./index.css";
import { Composition } from "remotion";
import { DURATION, JevPost } from "./JevPost";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition id="JevPost" component={JevPost} durationInFrames={DURATION} fps={30} width={1080} height={1080} />
  );
};
