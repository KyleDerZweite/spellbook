import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("worker")


def main() -> None:
    log.info("Spellbook worker starting")


if __name__ == "__main__":
    main()
