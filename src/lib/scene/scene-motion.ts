export const sceneMotion = {
  page: {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
  },
  hoverLift: {
    whileHover: { y: -2, scale: 1.01 },
    whileTap: { scale: 0.985 },
    transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] },
  },
  ritualClick: {
    whileTap: { scale: 0.97, filter: "brightness(1.18)" },
    transition: { duration: 0.18 },
  },
} as const;
