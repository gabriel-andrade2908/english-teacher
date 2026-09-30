"use client";

import { useMemo } from "react";
import { createAvatar } from "@dicebear/core";
import * as avataaars from "@dicebear/avataaars";
import type { Expression, Teacher } from "@/shared/teachers";

type AvataaarsOptions = avataaars.Options;

// Face parts for each expression. The rest of the look (hair, skin, clothes) stays fixed per teacher.
const FACES: Record<
  Expression,
  { eyes: AvataaarsOptions["eyes"]; eyebrows: AvataaarsOptions["eyebrows"]; mouth: AvataaarsOptions["mouth"] }
> = {
  neutral: { eyes: ["default"], eyebrows: ["defaultNatural"], mouth: ["default"] },
  happy: { eyes: ["default"], eyebrows: ["defaultNatural"], mouth: ["smile"] },
  laughing: { eyes: ["happy"], eyebrows: ["raisedExcitedNatural"], mouth: ["smile"] },
  grumpy: { eyes: ["squint"], eyebrows: ["angryNatural"], mouth: ["serious"] },
  surprised: { eyes: ["surprised"], eyebrows: ["raisedExcitedNatural"], mouth: ["disbelief"] },
  thinking: { eyes: ["side"], eyebrows: ["upDownNatural"], mouth: ["default"] },
  sad: { eyes: ["cry"], eyebrows: ["sadConcernedNatural"], mouth: ["sad"] },
  proud: { eyes: ["wink"], eyebrows: ["defaultNatural"], mouth: ["twinkle"] },
};

export function TeacherAvatar({
  teacher,
  expression = "neutral",
  size = 48,
  className = "",
}: {
  teacher: Teacher;
  expression?: Expression;
  size?: number;
  className?: string;
}) {
  const src = useMemo(() => {
    const { look } = teacher;
    const avatar = createAvatar(avataaars, {
      seed: teacher.id,
      style: ["circle"],
      top: [look.top as NonNullable<AvataaarsOptions["top"]>[number]],
      hairColor: [look.hairColor],
      hatColor: [look.clothesColor],
      skinColor: [look.skinColor],
      clothing: [look.clothing as NonNullable<AvataaarsOptions["clothing"]>[number]],
      clothesColor: [look.clothesColor],
      facialHair: look.facialHair ? [look.facialHair as NonNullable<AvataaarsOptions["facialHair"]>[number]] : undefined,
      facialHairColor: look.facialHairColor ? [look.facialHairColor] : undefined,
      facialHairProbability: look.facialHair ? 100 : 0,
      accessories: look.accessories
        ? [look.accessories as NonNullable<AvataaarsOptions["accessories"]>[number]]
        : undefined,
      accessoriesProbability: look.accessories ? 100 : 0,
      backgroundColor: [look.backgroundColor],
      ...FACES[expression],
    });
    return avatar.toDataUri();
  }, [teacher, expression]);

  return (
    // eslint-disable-next-line @next/next/no-img-element -- generated data URI, nothing to optimize
    <img
      src={src}
      width={size}
      height={size}
      alt={`${teacher.name} (${expression})`}
      className={`shrink-0 rounded-full ${className}`}
    />
  );
}
