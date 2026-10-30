import { useState, type ComponentPropsWithoutRef, type FormEvent } from "react"
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2, LockKeyhole, User } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export interface LoginFormProps extends ComponentPropsWithoutRef<"div"> {
  loginName: string
  password: string
  error?: string | null
  isLoading?: boolean
  onLoginNameChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onForgotPassword: () => void
  onFormSubmit: (event: FormEvent<HTMLFormElement>) => void
}

export function LoginForm({
  className,
  loginName,
  password,
  error,
  isLoading = false,
  onLoginNameChange,
  onPasswordChange,
  onForgotPassword,
  onFormSubmit,
  ...props
}: LoginFormProps) {
  const [showPassword, setShowPassword] = useState(false)

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="shadow-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">
            Đăng nhập hệ thống
          </CardTitle>
          <CardDescription>
            Cổng điều phối tiếp nhận &amp; quản trị DYM Medical Center
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={onFormSubmit} noValidate>
            <div className="flex flex-col gap-4">
              {error && (
                <div
                  role="alert"
                  aria-live="polite"
                  className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
                >
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              <div className="grid gap-2">
                <Label htmlFor="loginName">
                  Tài khoản
                </Label>
                <div className="relative">
                  <User
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    id="loginName"
                    name="username"
                    type="text"
                    placeholder="Nhập tên tài khoản"
                    autoComplete="username"
                    value={loginName}
                    disabled={isLoading}
                    onChange={(event) => onLoginNameChange(event.target.value)}
                    className="pl-9"
                    required
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">
                    Mật khẩu
                  </Label>
                  <button
                    type="button"
                    onClick={onForgotPassword}
                    className="text-xs text-muted-foreground underline-offset-4 hover:underline hover:text-foreground"
                  >
                    Quên mật khẩu?
                  </button>
                </div>
                <div className="relative">
                  <LockKeyhole
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Nhập mật khẩu"
                    autoComplete="current-password"
                    value={password}
                    disabled={isLoading}
                    onChange={(event) => onPasswordChange(event.target.value)}
                    className="pl-9 pr-9"
                    required
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" aria-hidden="true" />
                    ) : (
                      <Eye className="size-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="mt-2 w-full"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    <span>Đang đăng nhập...</span>
                  </>
                ) : (
                  <>
                    <span>Đăng nhập</span>
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
