import { Body, Controller, Get, HttpCode, Ip, Post } from '@nestjs/common';
import {
  CadastroUsuario,
  cadastroUsuarioSchema,
  Login,
  loginSchema,
  tokenSchema,
} from '@crista/domain';
import { z } from 'zod';
import { ZodPipe } from '../comum/zod.pipe';
import { Publico, UsuarioAtual, UsuarioAutenticado } from './auth.guard';
import { AuthService } from './auth.service';

const emailSchema = z.object({ email: z.string().trim().toLowerCase() });

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Publico()
  @Post('cadastro')
  cadastrar(
    @Body(new ZodPipe(cadastroUsuarioSchema)) dados: CadastroUsuario,
    @Ip() ip: string,
  ) {
    return this.auth.cadastrar(dados, ip);
  }

  @Publico()
  @Post('verificar-email')
  @HttpCode(204)
  verificarEmail(@Body(new ZodPipe(tokenSchema)) { token }: { token: string }) {
    return this.auth.verificarEmail(token);
  }

  @Publico()
  @Post('reenviar-verificacao')
  @HttpCode(204)
  reenviarVerificacao(
    @Body(new ZodPipe(emailSchema)) { email }: { email: string },
  ) {
    return this.auth.reenviarVerificacao(email);
  }

  @Publico()
  @Post('login')
  @HttpCode(200)
  login(@Body(new ZodPipe(loginSchema)) dados: Login) {
    return this.auth.login(dados);
  }

  @Get('eu')
  eu(@UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.auth.eu(usuario.id);
  }
}
