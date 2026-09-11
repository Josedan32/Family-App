from typing import Literal

from pydantic import BaseModel

Level = Literal["private", "summary", "public"]

# Spanish copy lives here, next to the rules it describes, so the settings
# screen cannot drift away from what the backend actually does
# (docs/visibility-rules.md §6, spec §8.4).
DISCLOSURES = [
    "Los totales del hogar incluyen a todos. Tu configuración controla si los "
    "demás ven tus números individuales, no si cuentas en el total del hogar.",
    "Los aportes al hogar siempre son visibles para toda la familia.",
]


class VisibilitySettingsRequest(BaseModel):
    income: Level
    expenses: Level
    savings: Level
    debts: Level


class VisibilitySettingsResponse(BaseModel):
    income: Level
    expenses: Level
    savings: Level
    debts: Level
    disclosures: list[str]
