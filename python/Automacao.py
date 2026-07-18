import time
import os
import sys
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from credenciais import usuario, senha  


options = Options()
main_directory = os.path.join(sys.path[0])
driver_path = ChromeDriverManager().install()

service = Service(executable_path= driver_path)
driver = webdriver.Chrome(service=service,options=options)
driver.get("https://support.oracle.com/signin")
time.sleep(20)


driver.find_element(By.XPATH, '//*[@id="mc-id-sign-in-with-oracle-account-btn_oj7|text"]').click()  # logo com iniciais do usuário
time.sleep(20)

driver.find_element(By.XPATH, '//*[@id="idcs-signin-basic-signin-form-username"]').send_keys(usuario)
time.sleep(30)
driver.find_element(By.XPATH, '//*[@id="idcs-signin-basic-signin-form-submit"]/button/div').click()  # logo com iniciais do usuário
time.sleep(20)

driver.find_element(By.XPATH, '//*[@id="idcs-auth-pwd-input|input"]').send_keys(senha)  # logo com iniciais do usuário
time.sleep(20)

driver.find_element(By.XPATH, '//*[@id="idcs-mfa-mfa-auth-user-password-submit-button"]/button').click()  # logo com iniciais do usuário
time.sleep(20)












driver.find_element(By.XPATH, '').send_keys(senha)
driver.find_element(By.XPATH, '//*[@id="btnActive"]').click()
print("Login realizado, aguardando tela inicial...")
time.sleep(10)  # espera tela inicial carregar

# === NAVEGAÇÃO ATÉ GERENCIAR MODELOS DE RELATÓRIO ===

