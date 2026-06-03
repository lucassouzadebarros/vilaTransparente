$env:JAVA_HOME = 'C:\Program Files\Java\jdk-17'
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
$env:DATABASE_URL = 'jdbc:postgresql://127.0.0.1:55433/portal_vila'
$env:DATABASE_USERNAME = 'portal_vila'
$env:DATABASE_PASSWORD = 'portal_vila'

mvn spring-boot:run
