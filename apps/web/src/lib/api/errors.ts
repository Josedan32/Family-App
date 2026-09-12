export interface Problem {
  type: string;
  title: string;
  status: number;
  detail?: string | null;
  instance?: string;
}

/** Branch on `type`, never on `title` — titles are Spanish copy and will change. */
export class ApiError extends Error {
  readonly type: string;
  readonly status: number;

  constructor(problem: Problem) {
    super(problem.title);
    this.name = "ApiError";
    this.type = problem.type;
    this.status = problem.status;
  }
}
