import { createServerFn } from "@tanstack/react-start";
import {
  changePasswordInputSchema,
  createUserInputSchema,
  loginInputSchema,
  mfaCodeInputSchema,
  resetUserMfaInputSchema,
  updateProfilePhotoInputSchema,
  updateUserInputSchema,
} from "@/lib/auth";

export const getCurrentViewerAction = createServerFn({ method: "GET" }).handler(async () => {
  const { getCurrentViewer } = await import("@/server/auth.server");
  return getCurrentViewer();
});

export const loginAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => loginInputSchema.parse(data))
  .handler(async ({ data }) => {
    const { loginUser } = await import("@/server/auth.server");
    return loginUser(data.email, data.password);
  });

export const logoutAction = createServerFn({ method: "POST" }).handler(async () => {
  const { logoutCurrentSession } = await import("@/server/auth.server");
  await logoutCurrentSession();
  return { ok: true as const };
});

export const listUsersAction = createServerFn({ method: "GET" }).handler(async () => {
  const { listUsers } = await import("@/server/auth.server");
  return listUsers();
});

export const createUserAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => createUserInputSchema.parse(data))
  .handler(async ({ data }) => {
    const { createUser } = await import("@/server/auth.server");
    await createUser(data);
    return { ok: true as const };
  });

export const updateUserAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => updateUserInputSchema.parse(data))
  .handler(async ({ data }) => {
    const { updateUser } = await import("@/server/auth.server");
    await updateUser(data);
    return { ok: true as const };
  });

export const changeOwnPasswordAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => changePasswordInputSchema.parse(data))
  .handler(async ({ data }) => {
    const { changeOwnPassword } = await import("@/server/auth.server");
    return changeOwnPassword(data);
  });

export const updateOwnProfilePhotoAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => updateProfilePhotoInputSchema.parse(data))
  .handler(async ({ data }) => {
    const { updateOwnProfilePhoto } = await import("@/server/auth.server");
    return updateOwnProfilePhoto(data);
  });

export const createOwnMfaSetupAction = createServerFn({ method: "POST" }).handler(async () => {
  const { createOwnMfaSetup } = await import("@/server/auth.server");
  return createOwnMfaSetup();
});

export const verifyOwnMfaSetupAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => mfaCodeInputSchema.parse(data))
  .handler(async ({ data }) => {
    const { verifyOwnMfaSetup } = await import("@/server/auth.server");
    return verifyOwnMfaSetup(data);
  });

export const validateMfaLoginAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => mfaCodeInputSchema.parse(data))
  .handler(async ({ data }) => {
    const { validateMfaLogin } = await import("@/server/auth.server");
    return validateMfaLogin(data);
  });

export const resetUserMfaAction = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => resetUserMfaInputSchema.parse(data))
  .handler(async ({ data }) => {
    const { resetUserMfa } = await import("@/server/auth.server");
    return resetUserMfa(data);
  });
