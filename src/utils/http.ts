import axios from "axios";
import * as qs from "querystring";
import { CONFIG } from "../config/constants";

export interface PostFormOptions {
  isAjax?: boolean;
  responseType?: "stream" | "json" | "text";
}

/**
  * Envía una petición POST con los datos codificados como formulario URL-encoded.
  * Maneja las cookies, el User-Agent común y las cabeceras AJAX de PrimeFaces.
  */
export async function postForm(
  url: string,
  payload: Record<string, string>,
  cookies: string,
  options: PostFormOptions = {}
) {
  const headers: Record<string, string> = {
    "Cookie": cookies,
    "Content-Type": options.isAjax
      ? "application/x-www-form-urlencoded; charset=UTF-8"
      : "application/x-www-form-urlencoded",
    "User-Agent": CONFIG.USER_AGENT,
  };
  
  if (options.isAjax) {
    headers["Faces-Request"] = "partial/ajax";
  }

  return axios.post(url, qs.stringify(payload), {
    headers,
    responseType: options.responseType as any,
  });
}
