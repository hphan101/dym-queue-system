import { useState, type ComponentPropsWithoutRef, type FormEvent } from "react"
import { AlertCircle, Eye, EyeOff, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
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
        <CardHeader className="px-6 pb-6 pt-8 text-center sm:px-8">
          <CardTitle className="text-2xl font-medium leading-tight tracking-normal">
            Đăng nhập hệ thống
          </CardTitle>
        </CardHeader>

        <CardContent className="px-6 pb-8 sm:px-8">
          <form onSubmit={onFormSubmit} noValidate>
            <div className="flex flex-col gap-6">
              {error && (
                <div
                  role="alert"
                  aria-live="polite"
                  className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
                >
                  <AlertCircle className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              <div className="grid gap-2">
                <Label htmlFor="loginName" className="text-base">
                  Tài khoản
                </Label>
                <Input
                  id="loginName"
                  name="username"
                  type="text"
                  placeholder="Nhập tên tài khoản"
                  autoComplete="username"
                  value={loginName}
                  disabled={isLoading}
                  onChange={(event) => onLoginNameChange(event.target.value)}
                  className="h-12 px-4 text-base md:text-base"
                  required
                />
              </div>

              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-base">
                    Mật khẩu
                  </Label>
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={onForgotPassword}
                    className="rounded-sm text-sm text-muted-foreground underline-offset-4 hover:underline hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
                  >
                    Quên mật khẩu?
                  </button>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Nhập mật khẩu"
                    autoComplete="current-password"
                    value={password}
                    disabled={isLoading}
                    onChange={(event) => onPasswordChange(event.target.value)}
                    className="h-12 pl-4 pr-12 text-base md:text-base"
                    required
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                    aria-pressed={showPassword}
                    aria-controls="password"
                    disabled={isLoading}
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" strokeWidth={1.5} aria-hidden="true" />
                    ) : (
                      <Eye className="size-4" strokeWidth={1.5} aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                size="lg"
                className="mt-2 h-12 w-full text-base"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" strokeWidth={1.5} aria-hidden="true" />
                    <span>Đang đăng nhập…</span>
                  </>
                ) : (
                  <span>Đăng nhập</span>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
