<template>
  <div class="relative flex min-h-screen w-full flex-col overflow-x-hidden bg-background-light font-display text-[#111813]">
    <div class="pointer-events-none absolute inset-0">
      <div
        class="absolute inset-0"
        style="
          background:
            radial-gradient(circle at 12% 16%, rgba(19, 236, 91, 0.22) 0%, rgba(19, 236, 91, 0) 38%),
            radial-gradient(circle at 88% 14%, rgba(17, 24, 19, 0.11) 0%, rgba(17, 24, 19, 0) 34%),
            radial-gradient(circle at 82% 88%, rgba(19, 236, 91, 0.14) 0%, rgba(19, 236, 91, 0) 30%),
            linear-gradient(160deg, #f6f8f6 0%, #edf4ef 54%, #e7f5eb 100%);
        "
      />
      <div
        class="absolute inset-0 opacity-[0.1]"
        style="
          background-image:
            linear-gradient(rgba(17, 24, 19, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(17, 24, 19, 0.1) 1px, transparent 1px);
          background-size: 40px 40px;
        "
      />
      <div class="absolute -left-20 top-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
      <div class="absolute -right-16 bottom-16 h-80 w-80 rounded-full bg-primary/15 blur-3xl" />
    </div>
    <div class="relative z-10 flex min-h-screen w-full flex-col">
      <slot />
    </div>
  </div>
</template>
